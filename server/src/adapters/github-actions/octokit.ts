import { Octokit } from 'octokit';
import type {
  GitHubActionsClient,
  RepoRef,
  WorkflowRunFilter,
  WorkflowRun,
} from '@devdigest/shared';
import { withRetry, withTimeout } from '../../platform/resilience.js';

const TIMEOUT = 30_000;
const DEFAULT_PER_PAGE = 20;

/**
 * `GitHubActionsClient` over Octokit REST — the pull-based CI ingest gateway
 * (Export-to-CI, L07/T-02). Deliberately separate from `OctokitGitHubClient`
 * (`adapters/github/octokit.ts`) even though both wrap the same `Octokit`
 * instance type: this port only exists for the Actions-API surface
 * (list workflow runs + download artifacts), which the read/write PR client
 * has no reason to depend on.
 */
export class OctokitGitHubActionsClient implements GitHubActionsClient {
  private octokit: Octokit;

  constructor(token: string, opts?: { octokit?: Octokit }) {
    this.octokit = opts?.octokit ?? new Octokit({ auth: token });
  }

  async listWorkflowRuns(repo: RepoRef, opts?: WorkflowRunFilter): Promise<WorkflowRun[]> {
    return withRetry(() =>
      withTimeout(
        (async () => {
          const perPage = opts?.perPage ?? DEFAULT_PER_PAGE;
          const res = opts?.workflowFile
            ? await this.octokit.rest.actions.listWorkflowRuns({
                owner: repo.owner,
                repo: repo.name,
                workflow_id: opts.workflowFile,
                per_page: perPage,
              })
            : await this.octokit.rest.actions.listWorkflowRunsForRepo({
                owner: repo.owner,
                repo: repo.name,
                per_page: perPage,
              });

          return Promise.all(
            res.data.workflow_runs.map(async (run) => {
              const artifactsRes = await this.octokit.rest.actions.listWorkflowRunArtifacts({
                owner: repo.owner,
                repo: repo.name,
                run_id: run.id,
              });
              return {
                id: String(run.id),
                prNumber: run.pull_requests?.[0]?.number ?? null,
                status: (run.status ?? 'completed') as WorkflowRun['status'],
                conclusion: run.conclusion ?? null,
                htmlUrl: run.html_url,
                createdAt: run.created_at,
                artifacts: artifactsRes.data.artifacts.map((a) => ({
                  id: String(a.id),
                  name: a.name,
                })),
              } satisfies WorkflowRun;
            }),
          );
        })(),
        TIMEOUT,
      ),
    );
  }

  async downloadArtifact(repo: RepoRef, artifactId: string): Promise<Buffer> {
    return withRetry(() =>
      withTimeout(
        (async () => {
          const res = await this.octokit.rest.actions.downloadArtifact({
            owner: repo.owner,
            repo: repo.name,
            artifact_id: Number(artifactId),
            archive_format: 'zip',
          });
          return Buffer.from(res.data as ArrayBuffer);
        })(),
        TIMEOUT,
      ),
    );
  }
}
