---
name: test-driven-development
description: >-
  Use Red→Green→Refactor for product behavior changes (features, bug fixes,
  domain/API logic, regression guards). Not for declarative toolchain config,
  docs, or mechanical edits. Use when the user mentions TDD, test-first,
  failing test, feature, bug fix, or behavior change in app code.
license: MIT
metadata:
  author: mengtaoxin
  version: "1.6.0"
---

# Test-driven development (for agents)

Prove intended product behavior with a failing test first, then make it pass
with the smallest change. "Looks right" is not done.

## Scope

**In scope** (full cycle): features and bug fixes in app code; domain rules,
mapping, validation, non-trivial helpers; HTTP / persistence / CRUD contracts;
regression guards for bugs with a meaningful automated hook.

**Out of scope** (no new test; never add one that only mirrors a literal you set):

- Docs, comments, formatting.
- Mechanical moves / renames with unchanged behavior (still run the suites when
  code changed).
- Declarative toolchain, build or dev-server config that flips an upstream
  option (bundler flag, lint rule, `tsconfig` option).
- Dependency bumps without logic changes; throwaway spikes (redo with the cycle
  before keeping them).

If unsure: in scope when the repo owns the **logic or contract**, out of scope
when you only flip an upstream tool's switch.

## Cycle (when in scope)

1. **Red**: state the behavior in one sentence; write or extend a test; run it
   and confirm it fails for the right reason (not a compile error, bad import or
   flaky setup).
2. **Green**: change production code just enough to pass. No drive-by refactors.
3. **Refactor**: clean up with tests green.

If no meaningful failing test can be written, clarify the requirement instead of
writing code or a hollow test.

## Layer

- Discover the project's test docs (`docs/testing.md`, `AGENTS.md`) and copy a
  nearby test's style, naming and location.
- Pick the lowest layer that locks the behavior; one focused test beats several
  overlapping ones. End-to-end only for user-visible integration.
- Prefer real collaborators over mocks when a lower layer expresses the
  contract cleanly.
- Verify behavior with automated tests. When the contract is page structure,
  assert it through the project's test runner. A check that only a person can
  judge by looking stays outside this cycle.

## Running

Use the project's scripts (`package.json`, `Makefile`, `AGENTS.md`). Prefer the
test scope the project already agrees to — some projects want the full suite on
every run. When it does not say, use this skill's default: the smallest check
that covers the change (focused tests on each Red / Green step, and that same
check again before finishing). Not done until that run passes.

## Do not

- Implement first, then write a test that mirrors the code.
- Assert a config flag equals the value you just set.
- Change a test to match buggy behavior without a product decision.
- Churn unrelated tests or snapshots.
- Use e2e as a substitute for a unit test of a pure helper.
- Leave Red unobserved, tests failing, or finish without the run the project
  requires — or the smallest covering check when the project does not say.
