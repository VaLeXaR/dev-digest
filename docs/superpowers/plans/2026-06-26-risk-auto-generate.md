# Risk Auto-Generate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-generate Risk Brief when Intent is generated, removing the separate "Generate risks" button.

**Architecture:** The `POST /pulls/:id/intent/generate` route handler becomes the orchestrator — it runs `IntentService.generate()` and `RisksService.generate()` in parallel via `Promise.all()`, writes both to the DB, and returns the intent record unchanged. The client hook invalidates both query caches on success; the OverviewTab empty-risks state drops the manual Generate button.

**Tech Stack:** Fastify 5 (server routes), TanStack Query (client mutations/queries), React 19, next-intl.

## Global Constraints

- No new routes, no schema changes, no new Zod contracts.
- `POST /pulls/:id/risks/generate` endpoint is preserved (no deletion).
- `useGenerateRisks` hook stays exported from `brief.ts` — just not used in `OverviewTab`.
- Server response contract for `POST /pulls/:id/intent/generate` stays `PrIntentRecord` (no change).
- Run `cd server && pnpm exec tsc --noEmit` after every server file edit.
- Run `cd client && pnpm typecheck && pnpm test` after every client file edit.

---

### Task 1: Server — intent route orchestrates risks generation in parallel

**Files:**
- Modify: `server/src/modules/intent/routes.ts`

**Interfaces:**
- Consumes: `RisksService` from `../risks/service.js` (already exists, `.generate(prId, workspaceId): Promise<PrRisksRecord>`)
- Produces: Same `PrIntentRecord` response as before; risks record written to DB as a side effect

- [ ] **Step 1: Replace the file content**

Open `server/src/modules/intent/routes.ts` and write the complete new version:

```ts
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { IntentService } from './service.js';
import { RisksService } from '../risks/service.js';

const intentRoutes: FastifyPluginAsync = async (appBase) => {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const intentService = new IntentService(app.container);
  const risksService = new RisksService(app.container);

  // GET /pulls/:id/intent
  // Returns the stored intent for a PR, or 404 when none has been generated yet.
  app.get(
    '/pulls/:id/intent',
    { schema: { params: IdParams } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const result = await intentService.get(req.params.id, workspaceId);
      if (!result) return reply.status(404).send({ error: 'Not found' });
      return result;
    },
  );

  // POST /pulls/:id/intent/generate
  // Runs intent + risks generation in parallel and returns the intent record.
  // Risks are written to the DB as a side effect; the risks query is invalidated client-side.
  app.post(
    '/pulls/:id/intent/generate',
    { schema: { params: IdParams } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const [intent] = await Promise.all([
        intentService.generate(req.params.id, workspaceId),
        risksService.generate(req.params.id, workspaceId),
      ]);
      return intent;
    },
  );
};

export default intentRoutes;
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd server && pnpm exec tsc --noEmit
```

Expected: exits 0, no errors.

- [ ] **Step 3: Run unit tests (no regressions)**

```bash
cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add server/src/modules/intent/routes.ts
git commit -m "feat(intent): generate risks in parallel when intent is generated"
```

---

### Task 2: Client hook — invalidate risks cache on intent mutation success

**Files:**
- Modify: `client/src/lib/hooks/brief.ts` (lines 20–29, `useRecalculateIntent`)

**Interfaces:**
- Consumes: `qc.invalidateQueries` (already imported via `useQueryClient`)
- Produces: `useRecalculateIntent` — same signature, now also invalidates `["risks", prId]` on success

- [ ] **Step 1: Edit `useRecalculateIntent` in `brief.ts`**

Find the `useRecalculateIntent` function (currently lines 20–29) and replace its `onSuccess` block:

**Before:**
```ts
    onSuccess: (_data, prId) => {
      qc.invalidateQueries({ queryKey: ["intent", prId] });
    },
```

**After:**
```ts
    onSuccess: (_data, prId) => {
      qc.invalidateQueries({ queryKey: ["intent", prId] });
      qc.invalidateQueries({ queryKey: ["risks", prId] });
    },
```

The complete updated function looks like:

```ts
export function useRecalculateIntent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (prId: string) =>
      api.post<PrIntentRecord>(`/pulls/${prId}/intent/generate`),
    onSuccess: (_data, prId) => {
      qc.invalidateQueries({ queryKey: ["intent", prId] });
      qc.invalidateQueries({ queryKey: ["risks", prId] });
    },
    onError: () => notify.error("Failed to recalculate intent"),
  });
}
```

- [ ] **Step 2: Verify TypeScript and tests pass**

```bash
cd client && pnpm typecheck && pnpm test
```

Expected: typecheck exits 0, all tests pass.

- [ ] **Step 3: Commit**

```bash
git add client/src/lib/hooks/brief.ts
git commit -m "feat(intent): invalidate risks cache when intent is recalculated"
```

---

### Task 3: Client — remove "Generate risks" button from OverviewTab

**Files:**
- Modify: `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/OverviewTab.tsx`

**Interfaces:**
- Consumes: `useRisks` (unchanged), `useRecalculateIntent` (unchanged) — removes `useGenerateRisks`
- Produces: `OverviewTab` component — same props, no Generate button in empty-risks state

- [ ] **Step 1: Write the complete updated file**

Replace the entire file content. The only changes from the current version are:
1. Remove `useGenerateRisks` from the import line
2. Remove the `const generateRisks = useGenerateRisks();` line
3. In the empty-risks state, replace the `<><p>...</p><Button>...</Button></>` fragment with just `<p style={s.emptyIntentText}>{t("intent.emptyRisks")}</p>`

```tsx
"use client";

import React from "react";
import { SectionLabel, Button, Icon } from "@devdigest/ui";
import type { IconName } from "@devdigest/ui";
import { useTranslations } from "next-intl";
import { useIntent, useRecalculateIntent, useRisks } from "../../../../../../../lib/hooks/brief";
import type { RiskSeverity } from "@devdigest/shared";
import { s } from "./styles";

interface OverviewTabProps {
  prBody: string | null | undefined;
  prId: string;
}

export function OverviewTab({ prBody, prId }: OverviewTabProps) {
  const t = useTranslations("prReview");
  const { data: intentData, isLoading: intentLoading } = useIntent(prId);
  const recalcMutation = useRecalculateIntent();
  const { data: risksData, isLoading: risksLoading } = useRisks(prId);

  const RISK_ICON: Record<RiskSeverity, IconName> = {
    high: "AlertOctagon",
    medium: "AlertTriangle",
    low: "Lightbulb",
  };

  const RISK_STYLE: Record<RiskSeverity, React.CSSProperties> = {
    high: s.chipRiskHigh,
    medium: s.chipRiskMedium,
    low: s.chipRiskLow,
  };

  const CheckIcon = Icon["Check"];
  const XIcon = Icon["X"];

  const recalcButton = (
    <Button
      kind="secondary"
      size="sm"
      icon="RefreshCw"
      loading={recalcMutation.isPending}
      onClick={() => recalcMutation.mutate(prId)}
    >
      {t("intent.recalculate")}
    </Button>
  );

  return (
    <>
      {/* Intent section */}
      {!intentLoading && (
        <section style={s.intentSection}>
          <SectionLabel icon="Target" right={recalcButton}>
            {t("intent.title")}
          </SectionLabel>

          {intentData ? (
            <>
              {intentData.intent && (
                <p style={s.intentSummary}>{String.fromCharCode(34)}{intentData.intent}{String.fromCharCode(34)}</p>
              )}

              {intentData.in_scope.length > 0 && (
                <div style={s.chipGroup}>
                  <div style={s.chipGroupLabel}>{t("intent.inScope")}</div>
                  <div style={s.chipRow}>
                    {intentData.in_scope.map((item: string) => (
                      <span key={item} style={s.chipIn}>
                        <CheckIcon size={12} />
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {intentData.out_of_scope.length > 0 && (
                <div style={s.chipGroup}>
                  <div style={s.chipGroupLabel}>{t("intent.outOfScope")}</div>
                  <div style={s.chipRow}>
                    {intentData.out_of_scope.map((item: string) => (
                      <span key={item} style={s.chipOut}>
                        <XIcon size={12} />
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Risk areas section */}
              {!risksLoading && (
                <div style={s.chipGroup}>
                  <div style={s.chipGroupLabel}>{t("intent.riskAreas")}</div>
                  {risksData && risksData.risks.length > 0 ? (
                    <div style={s.chipRow}>
                      {risksData.risks.map((risk) => {
                        const RiskIcon = Icon[RISK_ICON[risk.severity]];
                        return (
                          <span key={risk.title} style={RISK_STYLE[risk.severity]}>
                            <RiskIcon size={12} />
                            {risk.title}
                          </span>
                        );
                      })}
                    </div>
                  ) : (
                    <p style={s.emptyIntentText}>{t("intent.emptyRisks")}</p>
                  )}
                </div>
              )}
            </>
          ) : (
            <p style={s.emptyIntentText}>{t("intent.empty")}</p>
          )}
        </section>
      )}

      {prBody && (
        <section>
          <SectionLabel icon="MessageSquare">Description</SectionLabel>
          <div style={s.descriptionBox}>{prBody}</div>
        </section>
      )}
    </>
  );
}
```

> **Note:** If the Write tool introduces Unicode quote characters (U+2018/U+2019) in place of ASCII single quotes, run this PowerShell fix immediately after writing:
> ```powershell
> $p = "client\src\app\repos\[repoId]\pulls\[number]\_components\OverviewTab\OverviewTab.tsx"
> $r = Get-Content -Path $p -Raw
> [IO.File]::WriteAllText($p, $r.Replace([char]0x2018, [char]0x27).Replace([char]0x2019, [char]0x27), (New-Object Text.UTF8Encoding $false))
> ```

- [ ] **Step 2: Verify TypeScript and tests pass**

```bash
cd client && pnpm typecheck && pnpm test
```

Expected: typecheck exits 0, all tests pass.

- [ ] **Step 3: Commit**

```bash
git add "client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/OverviewTab.tsx"
git commit -m "feat(intent): remove standalone Generate risks button"
```

---

### Task 4: Client — update `emptyRisks` i18n copy

**Files:**
- Modify: `client/messages/en/prReview.json`

**Interfaces:**
- Consumes: nothing
- Produces: updated `intent.emptyRisks` string used in `OverviewTab` empty-risks state

- [ ] **Step 1: Update the `emptyRisks` key**

In `client/messages/en/prReview.json`, under the `"intent"` object, change:

**Before:**
```json
"emptyRisks": "No risks yet — click Generate to analyze this PR"
```

**After:**
```json
"emptyRisks": "No risk areas detected"
```

The `generateRisks` and `recalcRisksError` keys can stay — they are used by `useGenerateRisks` which remains exported, even if unused in `OverviewTab`.

- [ ] **Step 2: Verify JSON is valid**

```bash
node -e "require('./client/messages/en/prReview.json'); console.log('OK')"
```

Expected: prints `OK`.

- [ ] **Step 3: Verify typecheck passes**

```bash
cd client && pnpm typecheck
```

Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add client/messages/en/prReview.json
git commit -m "fix(intent): update empty risks copy to remove button reference"
```

---

## Self-Review

**Spec coverage:**
- ✅ Route orchestrates both services in parallel → Task 1
- ✅ Client cache invalidates risks after intent mutation → Task 2
- ✅ Generate button removed from empty-risks state → Task 3
- ✅ i18n copy updated → Task 4
- ✅ Response contract unchanged → Task 1 (returns `intent` from `[intent] = await Promise.all(...)`)
- ✅ `POST /pulls/:id/risks/generate` preserved → no file deletes
- ✅ `useGenerateRisks` remains exported → Task 3 only removes the call in OverviewTab

**Placeholder scan:** No TBDs, no vague steps — all steps contain actual code.

**Type consistency:**
- `intentService.generate(prId, workspaceId)` → matches `IntentService.generate(prId: string, workspaceId: string)` ✅
- `risksService.generate(prId, workspaceId)` → matches `RisksService.generate(prId: string, workspaceId: string)` ✅
- `qc.invalidateQueries({ queryKey: ["risks", prId] })` → same pattern as `["intent", prId]` already in use ✅
