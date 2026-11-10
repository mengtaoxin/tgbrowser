# Change code steps

Ordered workflow for planning or changing this control plane. Domain details stay in the linked docs.

| Need | Doc |
| --- | --- |
| Where files go | [file-structure.md](file-structure.md) |
| Run, env, examples, benches | [commands.md](commands.md) |
| Test layers and commands | [testing.md](testing.md) |
| API and TypeScript invariants | [conventions.md](conventions.md) |
| Wire contract and endpoints | [api-design-browserless-style.md](api-design-browserless-style.md) |
| Red → Green → Refactor | [test-driven-development](../.agents/skills/test-driven-development/SKILL.md) |

## Before finishing

Every change is done only when each item is done or skipped for a reason its section allows:

- [ ] Tests: Red → Green with the layer from step 2 when that step is in scope.
- [ ] Checks named in [commands.md](commands.md) and [testing.md](testing.md) for this change (step 3).
- [ ] Owning doc updated if a contract changed (step 4).

## 1. Orient

Read [file-structure.md](file-structure.md) only when adding or moving files, or when you do not yet know which file to change. Skip it when the entry file is already known. Follow [conventions.md](conventions.md). Session shape and endpoints: [api-design-browserless-style.md](api-design-browserless-style.md). Stack boundaries: [tech-stack.md](tech-stack.md).

Build the browser image (`docker compose build`) before creating sessions. One active session per profile; unknown `profileId` is `404`. CDP disconnect does not stop a session — callers must `DELETE`. Do not commit `data/` or `bench-results/`.

## 2. Tests

Follow the [test-driven-development](../.agents/skills/test-driven-development/SKILL.md) skill for behavior in app code (features, bug fixes, API and domain logic). Pick the layer and the commands from [testing.md](testing.md).

Out of scope (no new test): docs, comments, formatting, mechanical renames, and declarative toolchain config. Those still finish with step 3 when they change something the checks in that step cover.

While iterating, use the unit command in [testing.md](testing.md) (`npm test`, colocated `src/**/*.test.ts`). Run `npm run typecheck` when the change is TypeScript. Smoke and bench stay the layers named there. Do not add a harness outside `bench/`, and do not add a test that only mirrors a literal.

## 3. Verify

This repo has no single `verify` script. Run the commands in [commands.md](commands.md) that match the layer in [testing.md](testing.md):

- App or TypeScript changes: `npm test` and `npm run typecheck`.
- Session or browser-image behavior: `docker compose build` before creating sessions, then smoke with the API up (`npm run api`) and `npm run api-session`.
- Lifecycle or stealth measurement: `npm run bench:lifecycle` or `npm run bench:reachability`. Extend `bench/`. Do not commit `bench-results/` or `data/`.

Skip a command only when that layer does not apply to the change. Docs-only work does not start the API or rebuild the image.

## 4. Docs

Update the page that owns the changed contract. [file-structure.md](file-structure.md) is the map of where code lives; the wire contract is [api-design-browserless-style.md](api-design-browserless-style.md). Do not add lists that only mirror code; point to the source instead.
