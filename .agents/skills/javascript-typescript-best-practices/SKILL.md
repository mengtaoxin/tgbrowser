---
name: javascript-typescript-best-practices
description: >-
  Use when writing or reviewing JavaScript/TypeScript that is not React UI:
  types, modules, async, errors, APIs, and maintainability. Triggers on .ts/.js
  edits, adding TypeScript types, refactoring JS/TS, oxlint/oxfmt, or JS/TS
  best practices. Do not use for React components, hooks, JSX, or .tsx/.jsx UI
  — prefer react-best-practices for those.
license: MIT
metadata:
  author: mengtaoxin
  version: "1.4.0"
  docs: https://www.typescriptlang.org/docs/
---

# JavaScript & TypeScript best practices

Apply these practices when writing or changing JavaScript/TypeScript. Prefer project conventions when they conflict; discover them first (`tsconfig`, oxlint/oxfmt, existing modules).

## Defaults

1. Prefer **TypeScript** for new code when the project already uses it.
2. Match the project's module system (`"type": "module"`, CJS, path aliases).
3. Prefer **small, focused modules** and functions with one clear job.
4. Prefer **explicit types at boundaries** (exports, public APIs, IO); let inference work inside function bodies.
5. Do not invent new style rules that fight the repo's formatter/linter.

## TypeScript

- Enable and respect strictness already in `tsconfig` (`strict`, `noUncheckedIndexedAccess`, etc.). Do not weaken project strictness for convenience.
- Avoid `any`. Prefer `unknown` and narrow; use generics when the type depends on input.
- Prefer `interface` for object shapes that may be extended; use `type` for unions, intersections, mapped/conditional types, and tuples.
- Prefer `readonly` / `Readonly<T>` / `as const` when values should not mutate.
- Prefer discriminated unions over optional fields that mean different variants.
- Prefer `satisfies` to check a value against a type without widening.
- Do not use non-null assertions (`!`) unless the invariant is locally obvious and documented; prefer proper narrowing.
- Prefer `import type` / `export type` for type-only imports when the project/toolchain expects it.
- Avoid enums unless the codebase already uses them; prefer string-literal unions or `as const` maps.

```ts
// Prefer
type Status = "idle" | "loading" | "error";

function assertNever(x: never): never {
  throw new Error(`Unexpected: ${String(x)}`);
}
```

## JavaScript (and shared runtime rules)

- Prefer `const`; use `let` only when reassignment is required. Never `var`.
- Prefer arrow functions for callbacks; use `function` declarations for top-level named functions when that matches the file.
- Prefer template literals over string concatenation.
- Prefer optional chaining (`?.`) and nullish coalescing (`??`) over truthy defaults when `0` / `""` / `false` are valid.
- Prefer `for...of` or array methods over C-style index loops when clarity wins.
- Prefer early returns over deep nesting.
- Avoid mutating arguments; return new values unless mutation is the established local pattern (e.g. performance-critical hot paths).

## Async & concurrency

- Prefer `async`/`await` over raw `.then()` chains.
- Always handle or deliberately propagate promise rejections; do not leave floating promises in app code.
- Use `Promise.all` for independent parallel work; use sequential `await` when order or rate limits matter.
- Do not catch errors only to rethrow the same value without adding context.
- Prefer `AbortSignal` for cancellable fetch/IO when the host API supports it.

```ts
const [a, b] = await Promise.all([fetchA(), fetchB()]);
```

## Errors & result handling

- Throw `Error` (or project-specific subclasses), not strings.
- Put recovery at the right layer; do not swallow errors with empty `catch`.
- Prefer typed error narrowing (`instanceof`, discriminants) over parsing `error.message`.
- For expected failure modes at API boundaries, prefer result types or explicit union returns when that matches the codebase; otherwise throw.

## APIs & data

- Validate untrusted input at boundaries (HTTP, filesystem, user input). Do not trust external JSON shapes.
- Prefer the project's existing validation approach at boundaries over ad-hoc checks.
- Keep DTOs separate from domain models when the project already does so.
- Avoid leaking internal types across package/public API surfaces.

## Modules & structure

- Prefer named exports unless the file has a single primary export and default export is the local convention.
- Avoid circular imports; extract shared types/helpers when cycles appear.
- Keep side effects out of import time unless the module is an intentional entrypoint.

## Security & correctness

- Do not concatenate untrusted strings into HTML, SQL, shell commands, or dynamic code (`eval`, `new Function`).
- Prefer parameterized APIs and safe URL builders.
- Avoid leaking secrets into logs, client bundles, or error messages.

## Tooling

- Prefer **oxlint** for linting and **oxfmt** for formatting when adding or migrating tooling. If the project already has a linter/formatter, follow that and fix violations you introduce.
- Prefer existing scripts (`package.json`, `pnpm`/`npm`/`yarn`/`bun`) to run lint, format, and typecheck.
- After non-trivial TS changes, run the project's typecheck (`tsc --noEmit` or the repo script).

## Anti-patterns (do not)

- `any`, unchecked `as` casts, or `// @ts-ignore` to silence real type errors.
- Giant God modules without a clear split.
- Boolean parameter piles; prefer options objects once arity grows.
- Commenting out dead code; delete it (version control keeps history).
- Premature abstraction (shared util with one caller "just in case").
- Mixing CJS and ESM idioms in the same file when the project is ESM-only (or the reverse).

## Agent checklist

Before finishing JS/TS work:

1. Types at boundaries are honest; no new `any` without a short justification.
2. Async paths handle failure; no obvious floating promises.
3. Matches project module/import and naming conventions.
4. Lints/format for touched files are clean.
5. Typecheck passes when the change warrants it.
