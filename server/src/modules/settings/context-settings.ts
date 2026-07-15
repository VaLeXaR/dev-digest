import { eq } from 'drizzle-orm';
import { SettingsKnown } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import * as t from '../../db/schema.js';
import { rowsToSettings } from './helpers.js';

/** Contract defaults for the Context-Folder settings (mirror `platform.ts`'s `SettingsKnown`). */
const DEFAULT_ROOT_FOLDERS: string[] = ['specs', 'docs', 'insights'];
const DEFAULT_TOKEN_BUDGET = 4000;

/**
 * Resolves the workspace's Context-Folder root-folder set + token budget —
 * so a consumer (e.g. WhyRiskBriefService) reads settings through the
 * settings module instead of querying `container.db` directly (onion rule).
 * Mirrors `getFeatureModelOverride`'s read pattern (`settings/feature-models.ts`)
 * and `project-context/settings.ts`'s `resolveRootFolders`/`resolveTokenBudget`.
 */
export async function resolveContextSettings(
  container: Container,
  workspaceId: string,
): Promise<{ rootFolders: string[]; tokenBudget: number }> {
  const rows = await container.db
    .select({ key: t.settings.key, value: t.settings.value })
    .from(t.settings)
    .where(eq(t.settings.workspaceId, workspaceId));
  const settings = rowsToSettings(rows);

  const rootFoldersParsed = SettingsKnown.shape.context_root_folders.safeParse(
    settings.context_root_folders,
  );
  const tokenBudgetParsed = SettingsKnown.shape.context_token_budget.safeParse(
    settings.context_token_budget,
  );

  return {
    rootFolders: rootFoldersParsed.success ? rootFoldersParsed.data : DEFAULT_ROOT_FOLDERS,
    tokenBudget: tokenBudgetParsed.success ? tokenBudgetParsed.data : DEFAULT_TOKEN_BUDGET,
  };
}
