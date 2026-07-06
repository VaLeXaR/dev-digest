import { SmartDiff, LineContextResponse } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import { ReviewRepository } from '../reviews/repository.js';
import { classifyFiles } from './classifier.js';
import { LARGE_PR_THRESHOLD, LINE_CONTEXT_RADIUS, ROLE_ORDER } from './constants.js';

export class SmartDiffService {
  private readonly repo: ReviewRepository;

  constructor(private readonly container: Container) {
    this.repo = new ReviewRepository(container.db);
  }

  async get(prId: string, workspaceId: string): Promise<SmartDiff> {
    // Step 1: verify PR belongs to workspace
    const prRow = await this.repo.getPull(workspaceId, prId);
    if (!prRow) throw new NotFoundError('Pull request not found');

    // Step 2: load PR files
    const files = await this.repo.getPrFiles(prId);

    // Step 3: build findingsByFile from the most recent review
    const findingsByFile = new Map<string, { line: number; severity: string; id?: string }[]>();
    const reviews = await this.repo.reviewsForPull(prId);
    const mostRecent = reviews[0];
    if (mostRecent) {
      for (const finding of mostRecent.findings) {
        // Only include non-dismissed findings
        if (finding.dismissedAt != null) continue;
        const existing = findingsByFile.get(finding.file) ?? [];
        existing.push({ line: finding.startLine, severity: finding.severity, id: finding.id });
        findingsByFile.set(finding.file, existing);
      }
    }

    // Step 4: classify files by role
    const byRole = classifyFiles(files);

    // Step 5: build groups in ROLE_ORDER, skipping empty roles
    const groups = ROLE_ORDER.flatMap((role) => {
      const roleFiles = byRole.get(role) ?? [];
      if (roleFiles.length === 0) return [];
      return [
        {
          role,
          files: roleFiles.map((f) => ({
            path: f.path,
            additions: f.additions,
            deletions: f.deletions,
            patch: f.patch ?? null,
            findings: findingsByFile.get(f.path) ?? [],
            pseudocode_summary: null,
          })),
        },
      ];
    });

    // Step 6: compute split suggestion
    const total_lines = files.reduce((sum, f) => sum + f.additions + f.deletions, 0);
    const too_big = total_lines > LARGE_PR_THRESHOLD;
    const proposed_splits = ROLE_ORDER.flatMap((role) => {
      const roleFiles = byRole.get(role) ?? [];
      if (roleFiles.length === 0) return [];
      return [{ name: role, files: roleFiles.map((f) => f.path) }];
    });

    // Step 7: parse through Zod schema and return
    return SmartDiff.parse({
      groups,
      split_suggestion: { too_big, total_lines, proposed_splits },
    });
  }

  /**
   * A window of raw file lines around `line`, read at the PR's head commit —
   * for a click-to-line navigation target that isn't part of any rendered
   * diff hunk (the persisted `pr_files.patch` only carries the hunks GitHub
   * returned, so a Blast Radius caller's line is frequently missing from it).
   */
  async getLineContext(
    prId: string,
    workspaceId: string,
    file: string,
    line: number,
  ): Promise<LineContextResponse> {
    const prRow = await this.repo.getPull(workspaceId, prId);
    if (!prRow) throw new NotFoundError('Pull request not found');
    const repoRow = await this.repo.getRepo(prRow.repoId);
    if (!repoRow) throw new NotFoundError('Repo not found');
    const repoRef = { owner: repoRow.owner, name: repoRow.name };

    // The head commit is frequently NOT in the local mirror yet — the clone
    // only tracks the default branch (`sync()`), and a PR's head is only
    // fetched on demand. Try once, then fetch the PR head ref (which pulls
    // the commit object graph, independent of the local ref name it lands
    // under) and retry before giving up.
    let content: string;
    try {
      content = await this.container.git.showFile(repoRef, prRow.headSha, file);
    } catch {
      try {
        await this.container.git.fetchPullHead(repoRef, prRow.number);
        content = await this.container.git.showFile(repoRef, prRow.headSha, file);
      } catch {
        throw new NotFoundError(`${file} is not available at this PR's head commit`);
      }
    }

    const allLines = content.split('\n');
    if (line < 1 || line > allLines.length) throw new NotFoundError('Line out of range');

    const start = Math.max(1, line - LINE_CONTEXT_RADIUS);
    const end = Math.min(allLines.length, line + LINE_CONTEXT_RADIUS);
    const lines = [];
    for (let n = start; n <= end; n++) lines.push({ line: n, content: allLines[n - 1] ?? '' });

    return LineContextResponse.parse({ file, target_line: line, lines });
  }
}
