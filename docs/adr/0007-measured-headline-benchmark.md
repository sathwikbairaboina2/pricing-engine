# ADR 0007: The headline number comes from `pnpm bench` on the local pipeline, written to a results file

Status: accepted, 2026-10-04

## Context

The README needs a headline number in its first line, and the portfolio rule is "measured, never invented". There is no AWS account, so the design's AWS latency run cannot happen in v0.1.

## Decision

- `pnpm bench` measures the time from an input `PutItem` to the matching subscription message, on the local pipeline (ADR 0001).
  - Load: 100 SKUs, 50 updates/s for 60 s, so 3,000 samples, over one graphql-ws client.
  - It reports p50, p95, p99 and max latency.
  - It counts lost updates: writes with no message within 10 s.
  - It counts invariant violations: `HIST#<sku>` history items outside their stored band.
- The `bench` rule set has no step limit and no price ending. The harness picks competitor values that always change the price, so every write must produce exactly one message.
- Results go to `bench/results/<UTC timestamp>.json` and `bench/results/latest.json`. Each file records the machine, OS, Node version, DynamoDB Local image tag, poll interval, rate and duration.
- The README headline and DEVDOCS quote that file. The command exits non-zero if anything was lost or violated.
- `pnpm bench:core` reports `evaluate()` calls per second and the p99 time per call, over 100,000 calls with the `default` rule set.

## Consequences

- What we gave up: comparability with AWS. Two things dominate local latency:
  - the 250 ms idle poll interval, chosen to match Lambda's documented poll rate;
  - DynamoDB Local running on a laptop.

  AWS network hops and cold starts are not part of the number. The README says "local pipeline" next to it.
- A noisy laptop can move the number. The results file records the machine and the timestamp, so a rerun can be compared.
