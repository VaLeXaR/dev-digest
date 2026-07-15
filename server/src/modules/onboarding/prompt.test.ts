import { describe, it, expect } from 'vitest';
import { buildOnboardingPrompt } from './prompt.js';
import { INJECTION_GUARD, wrapUntrusted } from '@devdigest/reviewer-core';
import type { OnboardingFactBundle } from './facts.js';

const FACTS: OnboardingFactBundle = {
  criticalPathFiles: [
    { path: 'src/server.ts', rankPercentile: 0.99 },
    { path: 'src/db.ts', rankPercentile: 0.8 },
  ],
  readingPath: ['src/server.ts', 'src/routes.ts'],
  repoSkeleton: 'src/\n  server.ts\n  routes.ts',
  meta: { filesIndexed: 42, indexedAtSha: 'abc123' },
};

describe('buildOnboardingPrompt', () => {
  it('returns exactly one system and one user message', () => {
    const messages = buildOnboardingPrompt('acme/widgets', FACTS);

    expect(messages).toHaveLength(2);
    expect(messages[0]?.role).toBe('system');
    expect(messages[1]?.role).toBe('user');
  });

  it('prepends the shared INJECTION_GUARD to the system message', () => {
    const messages = buildOnboardingPrompt('acme/widgets', FACTS);

    expect(messages[0]?.content).toContain(INJECTION_GUARD);
  });

  it('wraps the repo skeleton in an untrusted block', () => {
    const messages = buildOnboardingPrompt('acme/widgets', FACTS);
    const user = messages[1]?.content ?? '';

    expect(user).toContain(wrapUntrusted('repo-skeleton', FACTS.repoSkeleton));
  });

  it('wraps the critical-path file list in an untrusted block', () => {
    const messages = buildOnboardingPrompt('acme/widgets', FACTS);
    const user = messages[1]?.content ?? '';
    const expectedList = FACTS.criticalPathFiles.map((f) => f.path).join('\n');

    expect(user).toContain(wrapUntrusted('critical-path-files', expectedList));
  });

  it('wraps the reading-path file list in an untrusted block', () => {
    const messages = buildOnboardingPrompt('acme/widgets', FACTS);
    const user = messages[1]?.content ?? '';
    const expectedList = FACTS.readingPath.join('\n');

    expect(user).toContain(wrapUntrusted('reading-path-files', expectedList));
  });

  it('every repo-authored fact string appears only inside an <untrusted…> block, never raw', () => {
    const messages = buildOnboardingPrompt('acme/widgets', FACTS);
    const user = messages[1]?.content ?? '';

    // Each fact string is present, and every occurrence is within delimiters.
    for (const raw of [
      FACTS.repoSkeleton,
      FACTS.criticalPathFiles.map((f) => f.path).join('\n'),
      FACTS.readingPath.join('\n'),
    ]) {
      const idx = user.indexOf(raw);
      expect(idx).toBeGreaterThan(-1);
      const before = user.slice(0, idx);
      const lastOpen = before.lastIndexOf('<untrusted');
      const lastClose = before.lastIndexOf('</untrusted>');
      expect(lastOpen).toBeGreaterThan(-1);
      expect(lastOpen).toBeGreaterThan(lastClose);
    }
  });

  it('instructs the model to annotate only — never reorder or add file paths', () => {
    const messages = buildOnboardingPrompt('acme/widgets', FACTS);
    const system = messages[0]?.content ?? '';

    expect(system).toMatch(/do not reorder/i);
    expect(system.toLowerCase()).toContain('do not add');
  });

  it('renders "(none)" for an empty critical-path/reading-path list rather than an empty block', () => {
    const emptyFacts: OnboardingFactBundle = {
      criticalPathFiles: [],
      readingPath: [],
      repoSkeleton: '',
      meta: { filesIndexed: 0, indexedAtSha: '' },
    };
    const messages = buildOnboardingPrompt('acme/widgets', emptyFacts);
    const user = messages[1]?.content ?? '';

    expect(user).toContain(wrapUntrusted('critical-path-files', '(none)'));
    expect(user).toContain(wrapUntrusted('reading-path-files', '(none)'));
  });
});
