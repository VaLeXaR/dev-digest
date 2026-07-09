# Retro Ledger

One row per `/workflow-retro` run. Append-only — this is the trend source, don't hand-edit
past rows. **Regression thresholds** (flag in the retro report, don't just log silently):
cost or token total up >20% week-over-week for a comparable workflow type, or fix-loop
rounds trending upward across 3+ consecutive runs of the same kind.

| date | label | workflow | agents (top/nested) | in→out tok | read_ratio | wall | parallelism | cost | fix-loop rounds (arch/plan) | top recommendation |
|------|-------|----------|----------------------|-----------|-----------|------|-------------|------|------------------------------|---------------------|
| 2026-07-09 | project-context-planning | implementation-planner + grilling (spec→plan stage only) | 3/1 | 132.3K→55.4K | 84.5% | 2266.6s | 1.07x | ~$15.53 (planner cost estimated, model tag missing) | n/a | Resume a stalled/API-error agent via SendMessage before treating it as failed and re-dispatching |
