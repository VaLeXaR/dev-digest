import { ReviewsRepository } from '../reviews/repository';

export interface RepoSummary {
  repoId: string;
  fullName: string;
  openReviewCount: number;
}

export class ReposService {
  private reviewsRepo = new ReviewsRepository();

  async getSummary(repoId: string, fullName: string, workspaceId: string): Promise<RepoSummary> {
    const rows = await this.reviewsRepo.listForRepo(repoId, workspaceId);
    const open = rows.filter((r) => r.status === 'pending' || r.status === 'running');
    return { repoId, fullName, openReviewCount: open.length };
  }
}
