export interface PullReviewRow {
  id: string;
  prNumber: number;
  status: string;
}

export class PullsService {
  async getLatestReview(pullId: string, workspaceId: string): Promise<PullReviewRow | null> {
    void pullId;
    void workspaceId;
    return null;
  }
}
