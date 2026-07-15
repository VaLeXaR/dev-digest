# specs

Cross-module feature specifications — for work that spans more than one package
(e.g. `server` + `client`, or a contract change touching `reviewer-core` too).

Specs scoped to a single package live in that package's own folder instead:
`server/specs/`, `client/specs/`, `reviewer-core/specs/`, `e2e/specs/`.

Written by the `spec-creator` agent (see [`.claude/agents/spec-creator.md`](../.claude/agents/spec-creator.md)).
Feeds the `implementation-planner` agent, which turns a confirmed spec into a
Development Plan under `docs/plans/`.
