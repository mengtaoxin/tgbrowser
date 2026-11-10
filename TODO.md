# TODO

Local follow-ups. Not a commitment to do them next — just so they are not lost.

## Benchmark

- [x] Core lifecycle bench (`create → CDP → goto → stop` + timings) — `npm run bench:lifecycle`
- [x] Core reachability smoke (example / wikipedia / baidu / sannysoft signals) — `npm run bench:reachability`
- [ ] Expand toward external-style benchmarks (later, not now)
  - Lifecycle: more runs, concurrency mode, stage regression thresholds (Steel / BrowserArena shape)
  - Reachability / stealth: curated high-security set (Cloudflare / PerimeterX / Datadome / …), blocked-rate metric
  - Optional agent layer: BU Bench / BrowserBench subset when we care about agent-on-infra scores
  - Keep full public leaderboard runs optional; prefer a small, repeatable local core that can grow
