#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { parseArgs, promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { createApiClient, ApiError } from './lib/api-client.js';
import type { ApiClient, DiffReview } from './lib/api-client.js';

const execFileAsync = promisify(execFile);

const USAGE = 'Usage: devdigest review --mode working';

export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UsageError';
  }
}

export function parseCliArgs(argv: string[]): { command: string; mode: string } {
  const { values, positionals } = parseArgs({
    args: argv,
    options: { mode: { type: 'string' } },
    allowPositionals: true,
  });

  const command = positionals[0];
  if (command !== 'review') {
    throw new UsageError(USAGE);
  }

  const mode = values.mode;
  if (!mode) {
    throw new UsageError(USAGE);
  }

  if (mode === 'staged' || mode === 'branch') {
    throw new UsageError(
      `Mode '${mode}' is not implemented yet. Only '--mode working' is supported.`,
    );
  }

  if (mode !== 'working') {
    throw new UsageError(USAGE);
  }

  return { command, mode };
}

export async function getWorkingDiff(cwd: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', ['diff'], {
      cwd,
      maxBuffer: 64 * 1024 * 1024,
    });
    return stdout;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.toLowerCase().includes('not a git repository')) {
      throw new Error(
        'Not a git repository. Run devdigest review from inside a git repo.',
      );
    }
    throw error;
  }
}

export function formatReview(review: DiffReview): string {
  const lines: string[] = [
    `DevDigest review — working tree · ${review.verdict} · ${review.score}/100 · ${review.findings.length} finding(s)`,
    '',
    review.summary,
  ];

  for (const finding of review.findings) {
    const lineRef =
      finding.end_line !== finding.start_line
        ? `${finding.start_line}-${finding.end_line}`
        : `${finding.start_line}`;
    lines.push('');
    lines.push(`[${finding.severity}] ${finding.file}:${lineRef}`);
    lines.push(finding.title);
    lines.push(finding.rationale);
    if (finding.suggestion) {
      lines.push(`Suggestion: ${finding.suggestion}`);
    }
  }

  return lines.join('\n');
}

const NETWORK_ERROR_CODES = ['ECONNREFUSED', 'ENOTFOUND', 'ECONNRESET', 'EAI_AGAIN'];

function isNetworkError(error: unknown): boolean {
  if (!(error instanceof Error) || error instanceof ApiError) {
    return false;
  }
  if (error.message.toLowerCase().includes('fetch failed')) {
    return true;
  }
  const code = (error as NodeJS.ErrnoException).code;
  if (code && NETWORK_ERROR_CODES.includes(code)) {
    return true;
  }
  const cause = (error as { cause?: unknown }).cause;
  const causeCode = cause instanceof Error ? (cause as NodeJS.ErrnoException).code : undefined;
  return causeCode !== undefined && NETWORK_ERROR_CODES.includes(causeCode);
}

export interface CliDeps {
  getDiff: (cwd: string) => Promise<string>;
  client: ApiClient;
  cwd: string;
  out: (message: string) => void;
  err: (message: string) => void;
  exit: (code: number) => void;
}

export async function runCli(
  argv: string[],
  deps: Partial<CliDeps> = {},
): Promise<void> {
  const getDiff = deps.getDiff ?? getWorkingDiff;
  const client = deps.client ?? createApiClient();
  const cwd = deps.cwd ?? process.cwd();
  const out = deps.out ?? ((message: string) => console.log(message));
  const err = deps.err ?? ((message: string) => console.error(message));
  const exit = deps.exit ?? ((code: number) => process.exit(code));

  try {
    parseCliArgs(argv);

    const diff = await getDiff(cwd);
    if (diff.trim() === '') {
      out('No uncommitted changes to review.');
      exit(0);
      return;
    }

    const review = await client.reviewDiff(diff);
    out(formatReview(review));
    exit(0);
  } catch (error) {
    if (error instanceof UsageError) {
      err(error.message);
      exit(2);
      return;
    }
    if (error instanceof ApiError) {
      err(`Review failed: ${error.message}`);
      exit(1);
      return;
    }
    if (isNetworkError(error)) {
      const baseUrl = process.env['DEVDIGEST_API_URL'] ?? 'http://localhost:4001';
      err(
        `Cannot reach the DevDigest API at ${baseUrl}. Is the server running? (start it with ./scripts/dev.sh)`,
      );
      exit(1);
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    err(message);
    exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void runCli(process.argv.slice(2), {});
}
