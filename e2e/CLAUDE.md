# e2e — context map (@devdigest/e2e)

## Before answering

Check [docs/](docs/), [specs/](specs/), and [INSIGHTS.md](INSIGHTS.md) in this module before reading code.

## What it is

Deterministic browser flows via agent-browser CLI (Rust + CDP).
No Playwright, no LLM, no API keys. Specs: `specs/NN-name.flow.json`.

## Commands

```sh
./scripts/e2e.sh  # hermetic (recommended): isolated stack :5433/:3101/:3100
npm test          # against your own running stack (requires freshly-seeded DB — see Gotchas)
```

## Conventions

- Only deterministic locators: `--url`, `--text`, `find role|text|label` — **NEVER** `chat` (AI mode)
- Flows target read-only seeded data only (acme/payments-api, PR #482, seeded agents)
- Failure screenshots → `e2e/test-results/` (git-ignored, uploaded as CI artifact)

## Gotchas

- Flows 02/04/05 assume the seeded repo is the ONLY one — will fail against a "dirty" dev DB
- **NEVER** `docker compose down -v` to reset — destroys the main `devdigest_pgdata` volume

## Read when

- Flow format, env knobs, coverage table → [README.md](README.md)
- CI workflow → [../.github/workflows/e2e-web.yml](../.github/workflows/e2e-web.yml)
- Test strategy → [../TESTING.md](../TESTING.md)
- Flow specs → [specs/](specs/)
- Accumulated module lessons → [INSIGHTS.md](INSIGHTS.md)
