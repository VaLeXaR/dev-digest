import { z } from 'zod';

/**
 * Onboarding Tour: a repo-scoped, LLM-authored guided tour composed from
 * deterministic repo-intel facts (architecture, critical paths, run-locally,
 * reading path, first tasks) plus server-attached meta. `OnboardingTour` is
 * the persisted `onboarding.json` shape; `OnboardingLlmOutput` is the
 * narrower schema handed to `completeStructured` — it carries only the
 * LLM-authored prose/annotations, never the deterministic ordering/ranking
 * fields the server computes and merges in afterward.
 */

// ---- Persisted tour (onboarding.json) ----
export const OnboardingArchitecture = z.object({
  summary: z.string(),
  diagram: z.string(),
});
export type OnboardingArchitecture = z.infer<typeof OnboardingArchitecture>;

export const OnboardingCriticalPath = z.object({
  path: z.string(),
  rankPercentile: z.number(),
  fanIn: z.number().int().optional(),
  why: z.string(),
});
export type OnboardingCriticalPath = z.infer<typeof OnboardingCriticalPath>;

export const OnboardingRunCommand = z.object({
  command: z.string(),
  comment: z.string().optional(),
});
export type OnboardingRunCommand = z.infer<typeof OnboardingRunCommand>;

export const OnboardingRunLocally = z.object({
  /** Always true — the whole section is model-generated, never verified-safe (R19/AC-24). */
  aiGenerated: z.literal(true),
  commands: z.array(OnboardingRunCommand),
});
export type OnboardingRunLocally = z.infer<typeof OnboardingRunLocally>;

export const OnboardingReadingPathEntry = z.object({
  path: z.string(),
  reason: z.string(),
});
export type OnboardingReadingPathEntry = z.infer<typeof OnboardingReadingPathEntry>;

export const OnboardingTaskComplexity = z.enum(['low', 'medium', 'high']);
export type OnboardingTaskComplexity = z.infer<typeof OnboardingTaskComplexity>;

export const OnboardingFirstTask = z.object({
  title: z.string(),
  rationale: z.string(),
  relatedFiles: z.array(z.string()).optional(),
  // Optional: tours persisted before this field existed won't have it —
  // the client omits the complexity pill rather than failing to parse.
  complexity: OnboardingTaskComplexity.optional(),
});
export type OnboardingFirstTask = z.infer<typeof OnboardingFirstTask>;

export const OnboardingMeta = z.object({
  filesIndexed: z.number().int(),
  generatedAt: z.string(),
  indexedAtSha: z.string(),
});
export type OnboardingMeta = z.infer<typeof OnboardingMeta>;

export const OnboardingTour = z.object({
  architecture: OnboardingArchitecture,
  criticalPaths: z.array(OnboardingCriticalPath),
  runLocally: OnboardingRunLocally,
  readingPath: z.array(OnboardingReadingPathEntry),
  firstTasks: z.array(OnboardingFirstTask),
  meta: OnboardingMeta,
});
export type OnboardingTour = z.infer<typeof OnboardingTour>;

// ---- LLM-authored subset (schema passed to completeStructured) ----
// Deterministic fields (rankPercentile, fanIn, ordering, meta) are NOT part
// of this schema — the server attaches them when merging the LLM's
// annotations onto the deterministically-ordered file lists.
export const OnboardingLlmCriticalPath = z.object({
  path: z.string(),
  why: z.string(),
});
export type OnboardingLlmCriticalPath = z.infer<typeof OnboardingLlmCriticalPath>;

export const OnboardingLlmReadingPathEntry = z.object({
  path: z.string(),
  reason: z.string(),
});
export type OnboardingLlmReadingPathEntry = z.infer<
  typeof OnboardingLlmReadingPathEntry
>;

export const OnboardingLlmOutput = z.object({
  architecture: OnboardingArchitecture,
  criticalPaths: z.array(OnboardingLlmCriticalPath),
  runLocally: z.object({
    commands: z.array(OnboardingRunCommand),
  }),
  readingPath: z.array(OnboardingLlmReadingPathEntry),
  firstTasks: z.array(OnboardingFirstTask),
});
export type OnboardingLlmOutput = z.infer<typeof OnboardingLlmOutput>;

// ---- Response DTOs (discriminated union — R9/R10) ----
export const OnboardingGetResponse = z.discriminatedUnion('state', [
  z.object({
    state: z.literal('ready'),
    tour: OnboardingTour,
    currentIndexedSha: z.string(),
  }),
  z.object({ state: z.literal('not_generated') }),
  z.object({ state: z.literal('index_required') }),
]);
export type OnboardingGetResponse = z.infer<typeof OnboardingGetResponse>;

export const OnboardingGenerateResponse = z.discriminatedUnion('state', [
  z.object({
    state: z.literal('ready'),
    tour: OnboardingTour,
    currentIndexedSha: z.string(),
  }),
  z.object({ state: z.literal('index_required') }),
]);
export type OnboardingGenerateResponse = z.infer<
  typeof OnboardingGenerateResponse
>;
