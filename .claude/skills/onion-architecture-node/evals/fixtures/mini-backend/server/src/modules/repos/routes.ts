import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { OctokitGitHubClient } from '../../adapters/github/octokit';
import { ReposService } from './service';

const service = new ReposService();

export async function repoRoutes(fastify: FastifyInstance) {
  fastify.get('/repos/:repoId/pulls', {
    schema: { params: z.object({ repoId: z.string().uuid() }) },
  }, async (req: any) => {
    const ctx = req.ctx;
    const gh = new OctokitGitHubClient(ctx.githubToken);
    const client = gh.raw();
    const { data } = await client.rest.pulls.list({
      owner: ctx.owner,
      repo: ctx.repo,
      state: 'open',
    });

    const eligible = data
      .filter((pr) => !pr.draft && pr.labels.every((l) => l.name !== 'wip'))
      .map((pr) => ({ number: pr.number, title: pr.title, author: pr.user?.login }));

    return eligible;
  });
}
