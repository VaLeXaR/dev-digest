import { z } from 'zod';

/**
 * Project Context: markdown docs discovered under configurable root folders
 * (default `specs`/`docs`/`insights`) on the already-cloned repo's
 * filesystem, attachable as review context to agents/skills. There is no
 * DB-backed content store — the clone's working tree is the single source of
 * truth for document content; `tracked` reflects live git status, not an
 * `origin` field.
 */

export const DiscoveredDoc = z.object({
  path: z.string(),
  root_folder: z.string(),
  filename: z.string(),
  /** Whether this path is currently tracked by git (vs. authored in-app and still untracked). */
  tracked: z.boolean(),
  /** ceil(byteLength / 4), server-computed. */
  token_estimate: z.number().int(),
  /** Distinct agents that would inject this doc at run time (direct attach ∪ enabled-skill inheritance). Computed fresh per request — never cached with the filesystem walk (D-UBA/D-FRESH). */
  used_by_agents: z.number().int(),
});
export type DiscoveredDoc = z.infer<typeof DiscoveredDoc>;

export const DiscoveryResponse = z.object({
  documents: z.array(DiscoveredDoc),
  file_count: z.number().int(),
  token_total: z.number().int(),
  token_budget: z.number().int(),
  /** ISO timestamp of the last scan; null when never scanned (e.g. repo not cloned). */
  scanned_at: z.string().nullable(),
  /** % of discovered docs referenced by ≥1 agent or skill in this workspace; null when zero docs are discovered (D-COV, repo-level aggregate). */
  coverage_pct: z.number().nullable(),
});
export type DiscoveryResponse = z.infer<typeof DiscoveryResponse>;

export const DocContentResponse = z.object({
  path: z.string(),
  content: z.string(),
});
export type DocContentResponse = z.infer<typeof DocContentResponse>;

export const CreateFolderBody = z.object({
  root_folder: z.string(),
  path: z.string(),
});
export type CreateFolderBody = z.infer<typeof CreateFolderBody>;

export const CreateFileBody = z.object({
  root_folder: z.string(),
  path: z.string(),
  content: z.string(),
});
export type CreateFileBody = z.infer<typeof CreateFileBody>;

export const EditDocBody = z.object({
  path: z.string(),
  content: z.string(),
});
export type EditDocBody = z.infer<typeof EditDocBody>;

export const SetContextDocsBody = z.object({
  paths: z.array(z.string()),
});
export type SetContextDocsBody = z.infer<typeof SetContextDocsBody>;

export const ContextDocsResponse = z.object({
  paths: z.array(z.string()),
});
export type ContextDocsResponse = z.infer<typeof ContextDocsResponse>;
