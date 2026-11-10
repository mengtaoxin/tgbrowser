# Testing

- **Unit:** `npm test` — Node built-in test runner via `tsx --test`, files `src/**/*.test.ts` colocated with code.
- **Types:** `npm run typecheck` before merging TypeScript changes.
- **Manual / smoke:** `npm run api-session` with API up and image built; `npm run stealth-check` for fingerprint checks.
- **Bench:** `npm run bench:lifecycle` / `bench:reachability` write under `bench-results/` (gitignored). Prefer these over inventing new harnesses unless extending `bench/`.

Do not commit `data/` or `bench-results/`.
