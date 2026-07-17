import { and, desc, eq, inArray, isNotNull } from 'drizzle-orm';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import { EvalCase, ExpectedFinding, type EvalCaseInput, type EvalOwnerKind } from '@devdigest/shared';

/**
 * A5 — eval-case data access (`eval_cases` table only). Row -> DTO mapping
 * safeParse's `expected_output` (jsonb) against `ExpectedFinding[]` to
 * tolerate legacy rows persisted before T-01 retyped the column from
 * `z.unknown()`.
 */

export type EvalCaseRow = typeof t.evalCases.$inferSelect;

function toEvalCase(row: EvalCaseRow): EvalCase {
  const expected = ExpectedFinding.array().safeParse(row.expectedOutput);
  return {
    id: row.id,
    owner_kind: row.ownerKind,
    owner_id: row.ownerId,
    name: row.name,
    input_diff: row.inputDiff ?? '',
    input_files: row.inputFiles,
    input_meta: row.inputMeta,
    code_before: row.codeBefore,
    code_after: row.codeAfter,
    code_mode: row.codeMode,
    expected_output: expected.success ? expected.data : [],
    notes: row.notes,
  };
}

/** Owner-generic case list — 'agent' or 'skill' owner, scoped by workspace. */
export async function listCasesForOwner(
  db: Db,
  workspaceId: string,
  ownerKind: EvalOwnerKind,
  ownerId: string,
): Promise<EvalCase[]> {
  const rows = await db
    .select()
    .from(t.evalCases)
    .where(
      and(
        eq(t.evalCases.workspaceId, workspaceId),
        eq(t.evalCases.ownerKind, ownerKind),
        eq(t.evalCases.ownerId, ownerId),
      ),
    )
    .orderBy(desc(t.evalCases.id));
  return rows.map(toEvalCase);
}

export async function listCasesForAgent(
  db: Db,
  workspaceId: string,
  agentId: string,
): Promise<EvalCase[]> {
  return listCasesForOwner(db, workspaceId, 'agent', agentId);
}

export async function getCase(
  db: Db,
  workspaceId: string,
  caseId: string,
): Promise<EvalCase | undefined> {
  const [row] = await db
    .select()
    .from(t.evalCases)
    .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.id, caseId)));
  return row ? toEvalCase(row) : undefined;
}

export async function createCase(
  db: Db,
  workspaceId: string,
  input: EvalCaseInput,
  sourceFindingId?: string | null,
): Promise<EvalCase> {
  const [row] = await db
    .insert(t.evalCases)
    .values({
      workspaceId,
      ownerKind: input.owner_kind,
      ownerId: input.owner_id,
      name: input.name,
      inputDiff: input.input_diff,
      inputFiles: input.input_files ?? null,
      inputMeta: input.input_meta ?? null,
      codeBefore: input.code_before ?? null,
      codeAfter: input.code_after ?? null,
      codeMode: input.code_mode ?? null,
      expectedOutput: input.expected_output,
      notes: input.notes ?? null,
      sourceFindingId: sourceFindingId ?? null,
    })
    .returning();
  return toEvalCase(row!);
}

export type EvalCaseUpdate = Partial<
  Pick<
    EvalCaseInput,
    | 'name'
    | 'input_diff'
    | 'input_files'
    | 'input_meta'
    | 'code_before'
    | 'code_after'
    | 'code_mode'
    | 'expected_output'
    | 'notes'
  >
>;

export async function updateCase(
  db: Db,
  workspaceId: string,
  caseId: string,
  patch: EvalCaseUpdate,
): Promise<EvalCase | undefined> {
  const set: Partial<EvalCaseRow> = {};
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.input_diff !== undefined) set.inputDiff = patch.input_diff;
  if (patch.input_files !== undefined) set.inputFiles = patch.input_files;
  if (patch.input_meta !== undefined) set.inputMeta = patch.input_meta;
  if (patch.code_before !== undefined) set.codeBefore = patch.code_before;
  if (patch.code_after !== undefined) set.codeAfter = patch.code_after;
  if (patch.code_mode !== undefined) set.codeMode = patch.code_mode;
  if (patch.expected_output !== undefined) set.expectedOutput = patch.expected_output;
  if (patch.notes !== undefined) set.notes = patch.notes;

  if (Object.keys(set).length === 0) return getCase(db, workspaceId, caseId);

  const [row] = await db
    .update(t.evalCases)
    .set(set)
    .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.id, caseId)))
    .returning();
  return row ? toEvalCase(row) : undefined;
}

export async function deleteCase(db: Db, workspaceId: string, caseId: string): Promise<boolean> {
  const rows = await db
    .delete(t.evalCases)
    .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.id, caseId)))
    .returning({ id: t.evalCases.id });
  return rows.length > 0;
}

/**
 * Every eval case a finding backs, newest first. The seed modal (screen 2)
 * picks the one whose expectation type matches the finding's CURRENT decision
 * (accepted → positive, dismissed → negative), so a stale case from a prior,
 * now-reversed decision is never reopened. A finding may back several cases
 * (re-click creates a new one, AC-26); `desc(id)` keeps newest first.
 */
export async function casesBySourceFinding(
  db: Db,
  workspaceId: string,
  findingId: string,
): Promise<EvalCase[]> {
  const rows = await db
    .select()
    .from(t.evalCases)
    .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.sourceFindingId, findingId)))
    .orderBy(desc(t.evalCases.id));
  return rows.map(toEvalCase);
}

/** AC-26 — the set of finding ids that already back an eval case. */
export async function casesBackedByFindings(
  db: Db,
  findingIds: string[],
): Promise<Set<string>> {
  if (findingIds.length === 0) return new Set();
  const rows = await db
    .select({ sourceFindingId: t.evalCases.sourceFindingId })
    .from(t.evalCases)
    .where(and(inArray(t.evalCases.sourceFindingId, findingIds), isNotNull(t.evalCases.sourceFindingId)));
  return new Set(rows.map((r) => r.sourceFindingId!));
}
