import type { Provider } from '@devdigest/shared';

/**
 * A skill has no `provider`/`model` of its own (`Skill` = `body`/`version`/
 * `enabled`, `knowledge.ts:142-157`) — a skill eval run has no host agent to
 * derive them from (R5/AC-38). Fixed to the same default the built-in
 * reviewer agents seed with (`server/src/db/seed.ts:12-13`), resolved in
 * grilling (2026-07-16). Verified against seed.ts at time of writing:
 * `DEFAULT_PROVIDER = 'openrouter'`, `DEFAULT_MODEL = 'deepseek/deepseek-v4-flash'`.
 */
export const SKILL_EVAL_PROVIDER: Provider = 'openrouter';
export const SKILL_EVAL_MODEL = 'deepseek/deepseek-v4-flash';
