import type { ChatMessage } from '@devdigest/shared';
import { INJECTION_GUARD, wrapUntrusted } from '@devdigest/reviewer-core';
import type { OnboardingFactBundle } from './facts.js';

/**
 * Untrusted-wrapped prompt builder for the single Onboarding Tour
 * `completeStructured` call (R1/R4/R5/AC-5/AC-6). Every repo-authored fact
 * (skeleton, file paths) is repo-controlled content — wrapped via
 * `wrapUntrusted` from `@devdigest/reviewer-core`, never handed to the model
 * as an instruction. The system message prepends the shared `INJECTION_GUARD`
 * so the model treats those blocks as data only.
 *
 * The lists are pre-ordered deterministically server-side (R2/R3); the model
 * is instructed to annotate them only — never reorder, drop, or add paths
 * (R4/AC-5). `service.ts` (T-04) drops any LLM-returned path not present in
 * the provided lists when merging.
 */

const TASK_FRAMING = [
  'You are generating an Onboarding Tour for a software repository, to help a',
  'new contributor get oriented quickly.',
  'You are given two DETERMINISTIC, PRE-ORDERED file lists (critical paths and',
  'a guided reading path) and a repo skeleton. Your job is to ANNOTATE the',
  'provided lists only:',
  '- For each critical-path file (in the exact order given), write a one-line',
  '  "why" explaining why it matters to the architecture.',
  '- For each reading-path file (in the exact order given), write a one-line',
  '  "reason" explaining why to read it at that point in the tour.',
  'Do NOT reorder either list. Do NOT add, remove, substitute, or invent any',
  'file path not present in the provided lists — annotate exactly the paths',
  'given, in the order given.',
  'Also produce: an architecture overview (a short prose summary plus a',
  'Mermaid diagram), a numbered list of shell commands to run the project',
  'locally (each with an optional one-line comment), and a short list of',
  'first-task suggestions for a new contributor (title + rationale + optional',
  'related file paths + a complexity rating of "low", "medium", or "high"',
  'reflecting how much codebase context the task requires).',
].join('\n');

function buildSystemMessage(): string {
  return [TASK_FRAMING, INJECTION_GUARD].join('\n\n');
}

function formatPathList(paths: string[]): string {
  return paths.length > 0 ? paths.join('\n') : '(none)';
}

/**
 * Builds the `ChatMessage[]` handed to `completeStructured` for one
 * Onboarding Tour generation.
 */
export function buildOnboardingPrompt(
  repoFullName: string,
  facts: OnboardingFactBundle,
): ChatMessage[] {
  const system = buildSystemMessage();

  const criticalPathsList = formatPathList(facts.criticalPathFiles.map((f) => f.path));
  const readingPathList = formatPathList(facts.readingPath);

  const userSections = [
    `Repository: ${repoFullName}`,
    [
      '## Critical-path files (deterministic rank order — annotate only, do not reorder)',
      wrapUntrusted('critical-path-files', criticalPathsList),
    ].join('\n'),
    [
      '## Guided reading path (deterministic dependency order — annotate only, do not reorder)',
      wrapUntrusted('reading-path-files', readingPathList),
    ].join('\n'),
    [
      '## Repo skeleton',
      wrapUntrusted('repo-skeleton', facts.repoSkeleton),
    ].join('\n'),
  ];

  const user = userSections.join('\n\n');

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}
