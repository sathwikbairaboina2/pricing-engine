# ADR 0004: Recompute from table state and guard the write with an (inputsVersion, ruleSetVersion) token

Status: accepted, 2026-10-04

## Context

DynamoDB Streams order records per item key, not per SKU across items. Lambda retries re-deliver whole batches. Two recomputes for the same SKU can run in either order.

## Decision

- The recompute handler ignores the record payload except for the SKU. It reloads the SKU with one strongly consistent `Query` on `PK = SKU#<sku>`, which returns META, the inputs, the override and the current price. It then reads the active rule set.
- `inputsVersion = sum(input seq) + override seq`. The `putInput` resolver and the simulator write an input only when the new `seq` is greater than the stored one (`attribute_not_exists(SK) OR #seq < :seq`). So every `seq` only grows, and equal sums mean equal states.
- `PRICE#CURRENT` and a history item (`PK = HIST#<sku>`, `SK = v<inputsVersion>#r<ruleSetVersion>`) are written in one `TransactWriteItems`. History has its own PK so the per-SKU Query does not grow with history.
  - The current item has the condition `attribute_not_exists(PK) OR inputsVersion < :v OR (inputsVersion = :v AND ruleSetVersion < :r)`.
  - The history item has the condition `attribute_not_exists(PK)`.
- A `TransactionCanceledException` with a `ConditionalCheckFailed` reason means a newer or equal computation already won. The record is acknowledged, not retried. Any other error marks the record in `batchItemFailures`.
- Records in one batch are grouped by SKU, and each SKU is recomputed once.

## Consequences

- Duplicate and out-of-order delivery give the same final state. Replays add no history items, so the publisher sees no new `PRICE#CURRENT` change.
- What we gave up: an extra read per SKU per batch (one Query) and a transaction (2 write units per item). A rule-set activation in v0.2 must bump `ruleSetVersion`, and the token already handles that.
- The token works only if every writer respects the `seq` condition. A direct table write that lowers a `seq` breaks it. DEVDOCS documents this rule.
