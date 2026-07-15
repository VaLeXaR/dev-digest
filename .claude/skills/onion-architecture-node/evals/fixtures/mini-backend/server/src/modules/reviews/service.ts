import { AnthropicProvider } from '../../adapters/llm/anthropic';
import { ReviewsRepository, type ReviewRow } from './repository';
import type { Finding } from '../../vendor/shared/adapters';

export function summarizeReviewForComment(body: string): string {
  return body.slice(0, 2000);
}

export class ReviewsService {
  private repo = new ReviewsRepository();
  private llm = new AnthropicProvider(process.env.ANTHROPIC_API_KEY ?? '');

  async getReview(id: string, workspaceId: string): Promise<ReviewRow | null> {
    return this.repo.findById(id, workspaceId);
  }

  async runReview(repoId: string, prNumber: number, workspaceId: string, diff: string): Promise<Finding[]> {
    const review = await this.repo.create({ repoId, prNumber, workspaceId });
    const findings = await this.llm.completeStructured<Finding[]>(
      `Review this diff and return findings as JSON:\n${diff}`,
      {},
    );
    return findings;
  }
}
