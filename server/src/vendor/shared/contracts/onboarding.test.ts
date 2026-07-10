import { describe, expect, it } from 'vitest';
import {
  OnboardingTour,
  OnboardingLlmOutput,
  OnboardingGetResponse,
  OnboardingGenerateResponse,
} from './onboarding.js';

const validTour = {
  architecture: { summary: 'A service composing repo-intel facts.', diagram: 'graph TD; A-->B;' },
  criticalPaths: [
    { path: 'src/index.ts', rankPercentile: 0.9, fanIn: 3, why: 'Entry point.' },
  ],
  runLocally: {
    aiGenerated: true,
    commands: [{ command: 'pnpm dev', comment: 'starts the server' }],
  },
  readingPath: [{ path: 'src/index.ts', reason: 'Start here.' }],
  firstTasks: [
    { title: 'Fix a bug', rationale: 'Good starter task.', relatedFiles: ['src/index.ts'] },
  ],
  meta: { filesIndexed: 42, generatedAt: '2026-07-10T00:00:00.000Z', indexedAtSha: 'abc123' },
};

describe('OnboardingTour', () => {
  it('parses a fully-populated tour', () => {
    expect(OnboardingTour.safeParse(validTour).success).toBe(true);
  });

  it('rejects aiGenerated: false (must always be true)', () => {
    const invalid = { ...validTour, runLocally: { ...validTour.runLocally, aiGenerated: false } };
    expect(OnboardingTour.safeParse(invalid).success).toBe(false);
  });

  it('rejects a tour missing a required section', () => {
    const { architecture: _architecture, ...withoutArchitecture } = validTour;
    expect(OnboardingTour.safeParse(withoutArchitecture).success).toBe(false);
  });
});

describe('OnboardingLlmOutput', () => {
  it('excludes deterministic fields (rankPercentile, fanIn, meta) from the LLM schema', () => {
    const llmOutput = {
      architecture: validTour.architecture,
      criticalPaths: [{ path: 'src/index.ts', why: 'Entry point.' }],
      runLocally: { commands: validTour.runLocally.commands },
      readingPath: validTour.readingPath,
      firstTasks: validTour.firstTasks,
    };
    expect(OnboardingLlmOutput.safeParse(llmOutput).success).toBe(true);
    // A criticalPaths entry carrying rankPercentile is still accepted (extra
    // keys are stripped by default), but the schema itself does not require it.
    expect(
      'rankPercentile' in OnboardingLlmOutput.shape.criticalPaths.element.shape,
    ).toBe(false);
    expect('meta' in OnboardingLlmOutput.shape).toBe(false);
  });
});

describe('OnboardingGetResponse', () => {
  it('accepts the ready/not_generated/index_required discriminated states', () => {
    expect(
      OnboardingGetResponse.safeParse({ state: 'ready', tour: validTour, currentIndexedSha: 'abc' })
        .success,
    ).toBe(true);
    expect(OnboardingGetResponse.safeParse({ state: 'not_generated' }).success).toBe(true);
    expect(OnboardingGetResponse.safeParse({ state: 'index_required' }).success).toBe(true);
  });

  it('rejects an unknown state', () => {
    expect(OnboardingGetResponse.safeParse({ state: 'bogus' }).success).toBe(false);
  });
});

describe('OnboardingGenerateResponse', () => {
  it('accepts only ready/index_required (no not_generated state)', () => {
    expect(
      OnboardingGenerateResponse.safeParse({
        state: 'ready',
        tour: validTour,
        currentIndexedSha: 'abc',
      }).success,
    ).toBe(true);
    expect(OnboardingGenerateResponse.safeParse({ state: 'index_required' }).success).toBe(true);
    expect(OnboardingGenerateResponse.safeParse({ state: 'not_generated' }).success).toBe(false);
  });
});
