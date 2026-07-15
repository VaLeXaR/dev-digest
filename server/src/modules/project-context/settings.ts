import { eq } from 'drizzle-orm';
import { SettingsKnown } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import * as t from '../../db/schema.js';
import { rowsToSettings } from '../settings/helpers.js';
import { DEFAULT_ROOT_FOLDERS } from './constants.js';

/** Contract default for `context_token_budget` (mirrors `platform.ts`'s `SettingsKnown`). */
const DEFAULT_TOKEN_BUDGET = 4000;

async function readSettings(container: Container, workspaceId: string) {
  const rows = await container.db
    .select({ key: t.settings.key, value: t.settings.value })
    .from(t.settings)
    .where(eq(t.settings.workspaceId, workspaceId));
  return rowsToSettings(rows);
}

/** Workspace override for the Project Context root-folder set, else the contract default. */
export async function resolveRootFolders(
  container: Container,
  workspaceId: string,
): Promise<string[]> {
  const settings = await readSettings(container, workspaceId);
  const parsed = SettingsKnown.shape.context_root_folders.safeParse(settings.context_root_folders);
  return parsed.success ? parsed.data : DEFAULT_ROOT_FOLDERS;
}

/** Workspace override for the Project Context token budget, else the contract default. */
export async function resolveTokenBudget(
  container: Container,
  workspaceId: string,
): Promise<number> {
  const settings = await readSettings(container, workspaceId);
  const parsed = SettingsKnown.shape.context_token_budget.safeParse(settings.context_token_budget);
  return parsed.success ? parsed.data : DEFAULT_TOKEN_BUDGET;
}
