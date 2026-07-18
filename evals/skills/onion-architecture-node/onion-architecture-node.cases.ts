import type { SkillCase } from "../../src/index.js";

// Content-tier cases: skillTask injects SKILL.md (+ references/*.md) as the system prompt and runs
// with NO tools, so each prompt inlines the concrete scenario the skill must reason over. Practices
// are worded against the skill's OWN vocabulary (the One Rule, the 6-step Decision Framework, the
// canonical "define the port first" move, reviewer-core purity) — never invented terminology.
export const cases: SkillCase[] = [
  {
    name: "places a new external SDK call as port + adapter + container wiring, not in a service",
    kind: "quality",
    prompt:
      "I'm adding a capability that calls the Linear API (an external HTTP SDK) to post issues " +
      "from a review. Where in the DevDigest backend should this code live, and how should a " +
      "service use it? Give the concrete file placement.",
    practices: [
      "says the external SDK call must be wrapped in an adapter under `src/adapters/<kind>/`, and must NOT be called directly from a service.ts or routes.ts",
      "says to define a port / interface first in `src/vendor/shared/adapters.ts` that speaks the app's language, rather than exposing the raw Linear SDK type",
      "says the adapter is wired in the composition root `platform/container.ts` and that services consume it via `container.<port>` (injected), never importing the SDK themselves",
    ],
    threshold: 0.7,
    maxTurns: 8,
  },
  {
    name: "flags a service doing a direct DB query and newing a concrete adapter",
    kind: "quality",
    prompt:
      "Review this against our architecture: `modules/reviews/service.ts` now does " +
      "`import { db } from '../../db/client'` and runs a Drizzle query directly, and also " +
      "constructs `new GitHubClientImpl()`. Is this correct? If not, what is the fix?",
    practices: [
      "flags that a service must NOT run DB queries directly — touching `drizzle-orm` / `db/schema` belongs in a repository (`modules/reviews/repository.ts`)",
      "flags that a service must NOT construct a concrete adapter with `new` — concrete adapters are built only in the composition root `platform/container.ts` and injected",
      "grounds the objection in the inward-only dependency rule (the Application layer must not depend on the outer Infrastructure/adapters layer)",
      "gives the concrete fix: move the query into a repository and consume the GitHub client via `container` rather than instantiating it",
    ],
    threshold: 0.7,
    maxTurns: 8,
  },
  {
    name: "keeps reviewer-core pure — rejects a direct octokit import",
    kind: "quality",
    prompt:
      "Can `reviewer-core/src/pipeline/run.ts` import `octokit` to fetch the PR diff from GitHub " +
      "directly? Explain per our layering.",
    practices: [
      "says NO — reviewer-core is the pure Core layer and must not import concrete infrastructure such as `octokit` (nor `fastify`, `drizzle-orm`, `simple-git`, `postgres`)",
      "says reviewer-core's only outside contact is a dependency injected as a port (the `LLMProvider` pattern) — external data must be passed in or reached through an injected interface, never imported as an SDK",
    ],
    threshold: 0.7,
    maxTurns: 8,
  },
];
