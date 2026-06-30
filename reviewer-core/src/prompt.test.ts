/**
 * assemblePrompt — PR Intent section (intent-layer integration).
 * Pins rendering, omit-when-absent, omit-when-empty-summary, ordering
 * (intent after description), and SCOPE_RULE injection into the system
 * message.
 */
import { describe, it, expect } from 'vitest';
import { assemblePrompt } from './prompt.js';
import type { PromptParts } from './prompt.js';

const base: PromptParts = {
  system: 'You are a reviewer.',
  diff: '@@ -1 +1 @@',
  task: 'Review PR #1',
  prDescription: 'Adds a rate limiter.',
};

describe('assemblePrompt intent section', () => {
  it('renders ## PR Intent after ## PR description when intent is present', () => {
    const { messages } = assemblePrompt({
      ...base,
      intent: { summary: 'Adds rate limiting', inScope: ['rate limiting'], outOfScope: ['auth'] },
    });
    const userContent = messages[1]!.content;

    expect(userContent).toContain('## PR Intent');
    expect(userContent).toContain('## PR description');

    const descIdx = userContent.indexOf('## PR description');
    const intentIdx = userContent.indexOf('## PR Intent');
    expect(intentIdx).toBeGreaterThan(descIdx);

    expect(userContent).toContain('Adds rate limiting');
  });

  it('omits ## PR Intent when intent is absent', () => {
    const { messages } = assemblePrompt(base);
    expect(messages[1]!.content).not.toContain('## PR Intent');
  });

  it('omits ## PR Intent when summary is whitespace-only', () => {
    const { messages } = assemblePrompt({
      ...base,
      intent: { summary: '   ', inScope: [], outOfScope: [] },
    });
    expect(messages[1]!.content).not.toContain('## PR Intent');
  });
});
