# ADR 0007: The headline number comes from `pnpm bench` on the local pipeline, written to a results file

Status: accepted, 2026-10-04

## Context

The README needs a headline number in its first line, and the portfolio rule is "measured, never invented". There is no AWS account, so the design's AWS latency run cannot happen in v0.1.

## Decision

- `pnpm bench` measures the time from an input `PutItem` to the matching subscription message, on the local pipeline (ADR 0001).
  - Load: 100 SKUs, 5 updates/s for 60 s, so 300 samples, over one graphql-ws client. CI runs a 10 s smoke at `--rate 5`.
  - Higher rates are available with `--rate`, but the default is 5 because DynamoDB Local serializes transactional writes on a stream-enabled table (see Consequences).
  - It reports p50, p95, p99 and max latency.
  - It counts delivered, superseded and lost updates. Superseded: the (SKU, version) message never arrived but a newer version of the same SKU did. The recompute handler prices only the latest stored state (ADR 0004), so such updates are coalesced by design. Lost: no message for that SKU at that version or newer within 10 s after the last write.
  - It records the achieved send rate (samples divided by the actual send time), because the sender caps in-flight writes at 20 and falls behind the nominal rate under load.
  - It counts invariant violations: `HIST#<sku>` history items outside their stored band.
- The `bench` rule set has no step limit and no price ending. The harness picks competitor values that always change the price, so every write must produce exactly one message.
- Results go to `bench/results/<UTC timestamp>.json` and `bench/results/latest.json`. Each file records the machine, OS, Node version, DynamoDB Local image tag, poll interval, rate and duration.
- The README headline and DEVDOCS quote that file. The command exits non-zero if anything was lost, any price mismatched or any invariant was violated. Superseded updates do not fail the run.
- `pnpm bench:core` reports `evaluate()` calls per second and the p99 time per call, over 100,000 calls with the `default` rule set.

## Consequences

- What we gave up: comparability with AWS. Two things dominate local latency:
  - the 250 ms idle poll interval, chosen to match Lambda's documented poll rate;
  - DynamoDB Local running on a laptop.

  AWS network hops and cold starts are not part of the number. The README says "local pipeline" next to it.
- What we gave up: the 50 updates/s in the original design. Measured on the build machine, with the classification above:
  - 20 updates/s for 30 s ([`2026-10-04T00-25-38-427Z.json`](../../bench/results/2026-10-04T00-25-38-427Z.json)): achieved 9.95/s, p50 281 ms, 100 of 600 superseded, 0 lost.
  - 20 updates/s for 30 s ([`2026-10-04T00-27-15-835Z.json`](../../bench/results/2026-10-04T00-27-15-835Z.json)): achieved 19.98/s, p50 1,801 ms, p99 12,475 ms, 81 of 600 superseded, 0 lost.
  - 50 updates/s for 10 s ([`2026-10-04T00-26-16-790Z.json`](../../bench/results/2026-10-04T00-26-16-790Z.json)): achieved 34.64/s, p50 6,964 ms, p99 10,107 ms, 189 of 500 superseded, 0 lost.

  An earlier version of the bench counted superseded updates as lost, which is why a first 50/s rerun reported 100 of 500 lost and the first README text blamed lost samples. With the split, no run lost a message. What higher rates show is queueing: latency grows from hundreds of milliseconds to seconds. The cause is probably DynamoDB Local serializing `TransactWriteItems` (writes took 6 to 50 ops/s depending on load), but that is not isolated by a dedicated measurement, so treat it as the likely explanation. 5 updates/s is the highest rate that stays inside one runner poll cycle without queueing.
- A noisy laptop can move the number. The results file records the machine and the timestamp, so a rerun can be compared.
