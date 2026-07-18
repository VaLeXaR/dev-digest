import { Octokit } from 'octokit';
import type { GitHubClient, PullRequest } from '../../vendor/shared/adapters';
import { summarizeReviewForComment } from '../../modules/reviews/service';

export class OctokitGitHubClient implements GitHubClient {
  private client: Octokit;

  constructor(token: string) {
    this.client = new Octokit({ auth: token });
  }

  raw(): Octokit {
    return this.client;
  }

  async getPullRequest(owner: string, repo: string, num: number): Promise<PullRequest> {
    const { data } = await this.client.rest.pulls.get({ owner, repo, pull_number: num });
    return {
      number: data.number,
      title: data.title,
      headSha: data.head.sha,
      baseSha: data.base.sha,
    };
  }

  async postComment(owner: string, repo: string, num: number, body: string): Promise<void> {
    const summary = summarizeReviewForComment(body);
    await this.client.rest.issues.createComment({
      owner,
      repo,
      issue_number: num,
      body: summary,
    });
  }
}
