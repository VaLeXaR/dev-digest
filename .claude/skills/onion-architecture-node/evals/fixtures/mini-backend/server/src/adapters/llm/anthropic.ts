import Anthropic from '@anthropic-ai/sdk';
import type { LLMProvider } from '../../vendor/shared/adapters';

export class AnthropicProvider implements LLMProvider {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async completeStructured<T>(prompt: string, _schema: unknown): Promise<T> {
    const res = await this.client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = res.content[0]?.type === 'text' ? res.content[0].text : '{}';
    return JSON.parse(text) as T;
  }
}
