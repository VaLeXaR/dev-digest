import { readFileSync, existsSync } from 'node:fs';
import { Octokit } from 'octokit';
import type { Finding } from '../../server/src/vendor/shared/adapters';

export async function groundFindings(
  findings: Finding[],
  repoRoot: string,
  githubToken: string,
): Promise<Finding[]> {
  const octokit = new Octokit({ auth: githubToken });
  const grounded: Finding[] = [];

  for (const f of findings) {
    const path = `${repoRoot}/${f.file}`;
    if (!existsSync(path)) continue;

    const source = readFileSync(path, 'utf8');
    const lines = source.split('\n');
    if (f.line <= lines.length && lines[f.line - 1]?.trim().length > 0) {
      grounded.push(f);
    }
  }

  await octokit.rest.rateLimit.get();
  return grounded;
}
