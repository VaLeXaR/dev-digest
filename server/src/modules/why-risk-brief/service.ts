import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import type { PrWhyRiskBriefRecord, SmartDiffGroup } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { resolveContextSettings } from '../settings/context-settings.js';
import { ReviewRepository } from '../reviews/repository.js';
import { BlastService } from '../blast/service.js';
import { SmartDiffService } from '../smart-diff/service.js';
import { getDiscovery } from '../project-context/discovery.js';
import {
  buildWhyRiskBriefInput,
  selectOverlappingSpecs,
  normalizeDiffStats,
  estimateBriefTokens,
  estimateFullDiffTokens,
} from './assembler.js';
import { callWhyRiskBriefLLM, type WhyRiskBriefLLMResult } from './extractor.js';

export class WhyRiskBriefService {
  private readonly repo: ReviewRepository;

  constructor(private readonly container: Container) {
    this.repo = new ReviewRepository(container.db);
  }

  /**
   * Zero-LLM cached read (AC-1/SC1). Reads a previously persisted brief (if
   * any) but never generates one — the LLM boundary is strictly `generate()`.
   */
  async get(prId: string, workspaceId: string): Promise<PrWhyRiskBriefRecord | null> {
    const prRow = await this.repo.getPull(workspaceId, prId);
    if (!prRow) throw new NotFoundError('Pull request not found');

    const brief = await this.repo.getWhyRiskBrief(prId);
    if (!brief) return null;
    return { ...brief, pr_id: prId };
  }

  /**
   * Runs the ONE structured LLM call in this feature: assembles derived-fact
   * input (intent, blast summary/downstream, diff statistics, linked issue,
   * overlapping Context-Folder specs — never raw diff/patch bodies, AC-4),
   * calls the extractor exactly once, persists on success, and on failure
   * (thrown error OR the extractor's own "unparseable payload" fallback)
   * returns the last persisted brief when one exists, else the deterministic
   * empty brief — never a 5xx (AC-8).
   */
  async generate(prId: string, workspaceId: string): Promise<PrWhyRiskBriefRecord> {
    const prRow = await this.repo.getPull(workspaceId, prId);
    if (!prRow) throw new NotFoundError('Pull request not found');

    const prFiles = await this.repo.getPrFiles(prId);
    const changedFiles = prFiles.map((f) => f.path);

    const intentRow = await this.repo.getIntent(prId);
    const intent = intentRow ?? null;

    // Blast summary + grouped downstream — read-only derived facts, no LLM
    // call of our own (BlastService.get() never generates a summary).
    const blastService = new BlastService(this.container);
    const blastRecord = await blastService.get(prId, workspaceId);

    // Diff statistics: prefer Smart Diff's grouped-by-role shape when it can
    // be computed, else fall back to raw per-file additions/deletions (AC-15,
    // e.g. when repo-intel is degraded).
    let smartDiffGroups: SmartDiffGroup[] | undefined;
    try {
      const smartDiffService = new SmartDiffService(this.container);
      const smartDiff = await smartDiffService.get(prId, workspaceId);
      smartDiffGroups = smartDiff.groups;
    } catch {
      smartDiffGroups = undefined;
    }
    const diffStats = normalizeDiffStats({
      smartDiffGroups,
      rawFiles: prFiles.map((f) => ({ path: f.path, additions: f.additions, deletions: f.deletions })),
    });

    // Best-effort enrichment: linked issue (GitHub) + overlapping Context-Folder
    // specs. Neither may ever block generation — no intent/blast/specs yet,
    // degraded repo-intel, no linked issue, or a missing GitHub token are all
    // expected edge cases that just leave the corresponding input section out.
    let linkedIssue: { title: string; body: string | null } | null = null;
    const specs: { path: string; content: string }[] = [];

    try {
      const repoRow = await this.repo.getRepo(prRow.repoId);
      if (repoRow) {
        const repoRef = { owner: repoRow.owner, name: repoRow.name };

        try {
          const gh = await this.container.github();
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
        } catch {
          // no GitHub token configured — proceed without linked issue
        }

        if (repoRow.clonePath) {
          try {
            const { rootFolders, tokenBudget } = await resolveContextSettings(
              this.container,
              workspaceId,
            );
            const discovery = await getDiscovery(
              this.container.git,
              repoRef,
              repoRow.id,
              repoRow.clonePath,
              rootFolders,
            );
            const selectedDocs = selectOverlappingSpecs(discovery.documents, changedFiles, tokenBudget);
            for (const doc of selectedDocs) {
              const content = await readGuardedFile(repoRow.clonePath, doc.path);
              if (content !== null) specs.push({ path: doc.path, content });
            }
          } catch {
            // discovery/spec read failed — proceed with no specs
          }
        }
      }
    } catch {
      // repo lookup itself failed — proceed with no repo-derived enrichment
    }

    const input = buildWhyRiskBriefInput({
      prTitle: prRow.title,
      prBody: prRow.body ?? null,
      intent,
      blastSummary: blastRecord.summary || null,
      downstream: blastRecord.downstream,
      diffStats,
      issue: linkedIssue,
      specs,
    });

    // References an LLM-authored risk/review-focus item may resolve against
    // (AC-6) — only what's literally present in the assembled input: diff
    // statistics file paths, blast-radius endpoints, and selected
    // Context-Folder spec paths (buildWhyRiskBriefInput's "File:" lines under
    // "Context-Folder Specs:", AC-6 must cover all three input categories, not
    // just two — a spec-only path is otherwise unresolvable even though the
    // LLM has literally seen it in the input). Caller file/line data is
    // intentionally NOT in resolvableRefs — buildWhyRiskBriefInput never
    // includes caller file paths (names only), so the LLM cannot have "seen" them.
    const resolvableRefs = new Set<string>([
      ...diffStats.map((f) => f.path),
      ...blastRecord.downstream.flatMap((d) => d.endpoints_affected),
      ...specs.map((s) => s.path),
    ]);

    const { provider, model } = await resolveFeatureModel(
      this.container,
      workspaceId,
      'why_risk_brief',
    );
    const llm = await this.container.llm(provider);

    const briefTokens = estimateBriefTokens(input);
    const fullDiffTokens = estimateFullDiffTokens(prFiles.map((f) => ({ patch: f.patch ?? null })));
    const savedPct = fullDiffTokens > 0 ? Math.round((1 - briefTokens / fullDiffTokens) * 100) : 0;

    // Token-savings instrument (R19/SC4) — format mirrors intent/service.ts.
    console.log(
      [
        '[why-risk-brief:call]',
        'prId=' + prId,
        'provider=' + provider,
        'model=' + model,
        'files=' + String(prFiles.length),
        'briefTokens=' + String(briefTokens),
        'fullDiffEstimate=' + String(fullDiffTokens),
        'saved=' + String(savedPct) + '%',
      ].join(' '),
    );

    // The structured call is exactly ONE per generate() (SC2). A thrown error
    // (network/provider failure) is treated the same as the extractor's own
    // "unparseable payload" fallback — never a 5xx (AC-8).
    let llmResult: WhyRiskBriefLLMResult;
    try {
      llmResult = await callWhyRiskBriefLLM(input, llm, model, resolvableRefs);
    } catch (err) {
      llmResult = {
        brief: { what: '', why: '', risk_level: 'low', risks: [], review_focus: [] },
        reason: err instanceof Error ? err.message : 'LLM call failed',
      };
    }

    console.log(
      [
        '[why-risk-brief:done]',
        'prId=' + prId,
        'provider=' + provider,
        'model=' + model,
        'outcome=' + (llmResult.reason === undefined ? 'success' : 'fallback'),
      ].join(' '),
    );

    if (llmResult.reason === undefined) {
      await this.repo.upsertWhyRiskBrief(prId, llmResult.brief);
      return { ...llmResult.brief, pr_id: prId };
    }

    // Fallback path (AC-8): last persisted brief when one exists, else the
    // deterministic empty brief the extractor returned.
    const previous = await this.repo.getWhyRiskBrief(prId);
    if (previous) return { ...previous, pr_id: prId };
    return { ...llmResult.brief, pr_id: prId };
  }
}

/**
 * Guarded single-file read, re-derived locally (not imported across modules —
 * `ProjectContextService`'s `readGuardedFile` is module-private) — same
 * traversal-guard invariant: resolve() both sides, never a raw string prefix
 * test. Returns null (not a throw) on escape/read failure so a vanished or
 * unreadable doc is skipped rather than aborting generation (best-effort).
 */
async function readGuardedFile(clonePath: string, path: string): Promise<string | null> {
  const resolvedRoot = resolve(clonePath);
  const full = resolve(clonePath, path);
  if (full !== resolvedRoot && !full.startsWith(resolvedRoot + sep)) return null;
  try {
    return await readFile(full, 'utf8');
  } catch {
    return null;
  }
}
