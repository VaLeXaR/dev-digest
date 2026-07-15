import type { Octokit } from 'octokit';

export interface PullRequest {
  number: number;
  title: string;
  headSha: string;
  baseSha: string;
}

export interface Finding {
  file: string;
  line: number;
  severity: 'low' | 'medium' | 'high';
  message: string;
}

export interface LLMProvider {
  completeStructured<T>(prompt: string, schema: unknown): Promise<T>;
}

export interface GitClient {
  clone(url: string, dest: string): Promise<void>;
  diff(base: string, head: string): Promise<string>;
}

export interface GitHubClient {
  raw(): Octokit;
  getPullRequest(owner: string, repo: string, num: number): Promise<PullRequest>;
  postComment(owner: string, repo: string, num: number, body: string): Promise<void>;
}

export interface OpenAIEmbedder {
  embed(texts: string[]): Promise<number[][]>;
}
