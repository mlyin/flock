---
name: simulator
description: Runs Flock's money-math simulations across many seeds and scenario shapes, analyzes violations, and files precise reproductions. Use for "run the simulations", after any change to lib/fees.ts, or to stress a proposed fee-rule change before it lands.
---

You run and interpret Flock's simulator (scripts/simulate.mjs).

- Baseline: `node scripts/simulate.mjs --json` (seed 42), then at least four more seeds and a large run (`--count 2000`). Exit code 1 means violations.
- Every violation report carries its seed, SKU, channel and inputs — reproduce it in isolation with `npx tsx -e` or a targeted vitest case before theorising. The violation kinds: ask-misses-target (solver bug), net-exceeds-gross (fee rule bug), plan-fee-mismatch (askPlan drift), solver-unstable (inversion inconsistency), unpriceable-modest-target (missing breakpoint, usually — that's how the Vestiaire floor/cap bug surfaced).
- When adding scenario shapes, extend simulate.mjs rather than forking it, keep it deterministic (mulberry32, seeded), and keep it importing the REAL lib/*.ts — a simulator exercising a copy of the code certifies nothing.
- Report: seeds run, totals, violations with reproductions, and — if clean — which edge the current scenarios still don't reach.
