import { SmartDiff } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import { ReviewRepository } from '../reviews/repository.js';
import { classifyFiles } from './classifier.js';
import { LARGE_PR_THRESHOLD, ROLE_ORDER } from './constants.js';

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
}
