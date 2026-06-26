import type { PrIntentRecord } from '@devdigest/shared';
import type { GitHubClient } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { ReviewRepository } from '../reviews/repository.js';
import { buildIntentInput, callIntentLLM, estimateTokens } from './extractor.js';

export class IntentService {
  private readonly repo: ReviewRepository;

  constructor(private readonly container: Container) {
    this.repo = new ReviewRepository(container.db);
  }

  /**
   * Return the stored intent for a PR, or null when none has been generated yet.
   * Throws NotFoundError when the PR does not belong to the workspace.
   */
  async get(prId: string, workspaceId: string): Promise<PrIntentRecord | null> {
    const prRow = await this.repo.getPull(workspaceId, prId);
    if (!prRow) throw new NotFoundError('Pull request not found');

    const intent = await this.repo.getIntent(prId);
    if (!intent) return null;
    return { ...intent, pr_id: prId };
  }

  /**
   * Run the full intent-generation pipeline for a PR and persist the result.
   * Steps: load PR + files → best-effort GitHub enrichment → LLM → persist → return.
   */
  async generate(prId: string, workspaceId: string): Promise<PrIntentRecord> {
    // Step A: load PR data from DB via repository layer
    const prRow = await this.repo.getPull(workspaceId, prId);
    if (!prRow) throw new NotFoundError('Pull request not found');

    const prFiles = await this.repo.getPrFiles(prId);

    // Step B: best-effort GitHub data — never throw
    let linkedIssue: { title: string; body: string | null } | null = null;
    let planContent: string | null = null;

    try {
      const repoRow = await this.repo.getRepo(prRow.repoId);

      if (repoRow) {
        const repoRef = { owner: repoRow.owner, name: repoRow.name };
        let gh: GitHubClient | null = null;
        try {
          gh = await this.container.github();
        } catch {
          gh = null;
        }

        if (gh) {
          try {
            const prDetail = await gh.getPullRequest(repoRef, prRow.number);
            if (prDetail.linked_issue) {
              linkedIssue = {
                title: prDetail.linked_issue.title,
                body: prDetail.linked_issue.body ?? null,
              };
            }
          } catch {
            // linked issue fetch failed — proceed without it
          }
        }

        // Step C: resolve plan content
        planContent = await this.resolvePlanContent(prRow.body ?? null, gh, repoRef);
      }
    } catch {
      // Entire Step B is best-effort — never let it block generation
    }

    // Step D: build input, call LLM, log, persist
    const input = buildIntentInput({
      title: prRow.title,
      body: prRow.body ?? null,
      planContent,
      issue: linkedIssue,
      files: prFiles.map((f) => ({ path: f.path, patch: f.patch ?? null })),
    });

    const { provider, model } = await resolveFeatureModel(
      this.container,
      workspaceId,
      'review_intent',
    );
    const llm = await this.container.llm(provider);
    const { intent, tokensIn } = await callIntentLLM(input, llm, model);

    const fullDiffTokens = estimateTokens(
      prFiles.map((f) => f.patch ?? '').join('\n'),
    );
    console.log(
      [
        '[intent]',
        'prId=' + prId,
        'tokensIn=' + String(tokensIn),
        'fullDiffEstimate=' + String(fullDiffTokens),
        'saved=' + String(Math.round((1 - tokensIn / fullDiffTokens) * 100)) + '%',
      ].join(' '),
    );

    await this.repo.upsertIntent(prId, intent);
    return { ...intent, pr_id: prId };
  }

  /**
   * Inspect the PR body to find the richest plan/specification content.
   * Returns the first non-null result from the three heuristics, or null.
   */
  private async resolvePlanContent(
    body: string | null,
    gh: GitHubClient | null,
    repoRef: { owner: string; name: string },
  ): Promise<string | null> {
    // 1. Empty body → no plan
    if (!body) return null;

    // 2. Long body with spec-like headings → the body itself is the plan
    const SPEC_PATTERN = /- \[ \]|## Requirements|## Tasks|## Specification|## Acceptance Criteria|### /;
    if (body.length > 200 && SPEC_PATTERN.test(body)) {
      return body;
    }

    // 3. Body contains a GitHub issue/PR URL → fetch its body
    const URL_PATTERN = /https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/(?:issues|pull)\/(\d+)/;
    const urlMatch = URL_PATTERN.exec(body);
    if (urlMatch) {
      const issueNumber = Number(urlMatch[1]);
      // Extract owner/repo from the matched URL
      const urlOwnerRepoMatch = /https:\/\/github\.com\/([^/\s]+)\/([^/\s]+)\/(?:issues|pull)\/\d+/.exec(body);
      const issueRepoRef = urlOwnerRepoMatch
        ? { owner: urlOwnerRepoMatch[1]!, name: urlOwnerRepoMatch[2]! }
        : repoRef;

      if (gh) {
        try {
          const issue = await gh.getIssue(issueRepoRef, issueNumber);
          if (issue.body) {
            return issue.body.slice(0, 8000);
          }
        } catch {
          // best-effort — continue
        }
      }
    }

    return null;
  }
}
