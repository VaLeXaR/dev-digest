# Retro Ledger

One row per `/workflow-retro` run. Append-only — this is the trend source, don't hand-edit
past rows. **Regression thresholds** (flag in the retro report, don't just log silently):
cost or token total up >20% week-over-week for a comparable workflow type, or fix-loop
rounds trending upward across 3+ consecutive runs of the same kind.

| date | label | workflow | agents (top/nested) | in→out tok | read_ratio | wall | parallelism | cost | fix-loop rounds (arch/plan) | top recommendation |
|------|-------|----------|----------------------|-----------|-----------|------|-------------|------|------------------------------|---------------------|
| 2026-07-09 | project-context-planning | implementation-planner + grilling (spec→plan stage only) | 3/1 | 132.3K→55.4K | 84.5% | 2266.6s | 1.07x | ~$15.53 (planner cost estimated, model tag missing) | n/a | Resume a stalled/API-error agent via SendMessage before treating it as failed and re-dispatching |
| 2026-07-09 | project-context-replan | implementation-planner (full rewrite, post spec-revision) + grilling | 1/n·a (undercounted — see report) | 157.5K total (no in/out split, in-context only) | n/a | 652.0s (planner dispatch only; grilling wall-clock unmeasured) | 1.0x | n/a (not verified this run) | n/a (pre-implementation stage) | Grilling's own codebase-evidence questions must dispatch `researcher` subagents per the skill's explicit instruction, not direct Grep/Read/Bash by the coordinator |
| 2026-07-09 | project-context-implementation | run-plan (full build+verify, 15-task multi-agent) | 21/0 | 1.13M→489K | 94.2% | 27530.9s (7.65h) | 1.63x | n/a (pricing not verified) | 0/1 (arch-reviewer PASS first try; plan-verifier looped 1 round: REVIEW→fix→PASS) | Dispatch a same-phase task as soon as its own `Depends-on` clears, not when the whole phase batch reports — would have saved ~3.8h of this run's wall-clock (T-05 waited behind T-06/T-07's unrelated API-limit stall) |
