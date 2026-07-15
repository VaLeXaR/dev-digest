import { AnthropicProvider } from '../adapters/llm/anthropic';
import { OctokitGitHubClient } from '../adapters/github/octokit';
import type { LLMProvider, GitHubClient } from '../vendor/shared/adapters';

export interface ContainerOverrides {
  llm?: LLMProvider;
  github?: GitHubClient;
}

export class Container {
  private overrides: ContainerOverrides;

  constructor(overrides: ContainerOverrides = {}) {
    this.overrides = overrides;
  }

  llm(): LLMProvider {
    return this.overrides.llm ?? new AnthropicProvider(process.env.ANTHROPIC_API_KEY ?? '');
  }

  github(token: string): GitHubClient {
    return this.overrides.github ?? new OctokitGitHubClient(token);
  }
}

export const container = new Container();
