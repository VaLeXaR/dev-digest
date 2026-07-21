import { stringify as stringifyYaml } from 'yaml';
import { AgentManifest } from '@devdigest/shared';
import type { AgentRow, SkillRow } from '../../db/rows.js';
import { ValidationError } from '../../platform/errors.js';

/**
 * Pure serializers — agent + linked skills → the on-disk manifest shape the
 * SAME `AgentManifest` Zod contract validates on the runner side
 * (`agent-runner/src/manifest.ts:loadAgentManifest`). No I/O here; the DB
 * reads live in `service.ts`/`repository.ts`.
 */

/**
 * Deterministic, filesystem-safe slug for an agent/skill name — collapses to
 * lowercase kebab-case, strips anything that isn't `[a-z0-9-]`. Never empty:
 * a name that's ALL non-alphanumeric (e.g. emoji-only) falls back to a fixed
 * placeholder so `.devdigest/agents/<slug>.yaml` always has a real file name.
 */
export function toSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'agent';
}

/** Build the `AgentManifest` object for `agent`, resolving skill slugs in link order. */
export function buildAgentManifest(agent: AgentRow, linkedSkills: SkillRow[]): AgentManifest {
  const manifest: AgentManifest = {
    name: agent.name,
    provider: agent.provider,
    model: agent.model,
    system_prompt: agent.systemPrompt,
    skills: linkedSkills.map((s) => toSlug(s.name)),
    strategy: agent.strategy,
    ci_fail_on: agent.ciFailOn,
  };
  // Fail loudly at generation time (not silently at ingest, weeks later in
  // someone else's CI) if the shape we just built cannot round-trip through
  // the same contract the runner will validate it with (AC-13).
  const parsed = AgentManifest.safeParse(manifest);
  if (!parsed.success) {
    throw new ValidationError(
      `Generated agent manifest failed AgentManifest validation: ${parsed.error.message}`,
    );
  }
  return parsed.data;
}

/** Serialize a validated manifest to YAML text for `.devdigest/agents/<slug>.yaml`. */
export function serializeManifestYaml(manifest: AgentManifest): string {
  return stringifyYaml(manifest);
}
