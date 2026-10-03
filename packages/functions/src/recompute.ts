import { evaluate } from 'pricing-rules-core';
import type { DynamoDBBatchResponse, DynamoDBStreamEvent } from 'aws-lambda';
import { isNewer, type PricingStore } from './store.js';
import { recordSku } from './stream.js';

export type RecomputeOutcome = 'WRITTEN' | 'STALE' | 'NO_META' | 'NO_PRICE';
export interface RecomputeDeps { store: PricingStore; now: () => number; log?: (entry: Record<string, unknown>) => void }

const defaultLog = (e: Record<string, unknown>) => console.log(JSON.stringify(e));

export async function recomputeSku(sku: string, deps: RecomputeDeps): Promise<RecomputeOutcome> {
  const log = deps.log ?? defaultLog;
  const state = await deps.store.loadSku(sku);
  if (!state) { log({ msg: 'recompute', sku, outcome: 'NO_META' }); return 'NO_META'; }
  const ruleSet = await deps.store.loadActiveRuleSet(state.meta.ruleSetId);
  const now = deps.now();
  const decision = evaluate({
    inputs: state.inputs,
    ...(state.override ? { override: state.override } : {}),
    ...(state.current ? { previousPriceMinor: state.current.priceMinor } : {}),
    ruleSet,
    now,
  });
  if (decision.kind === 'NO_PRICE') {
    log({ msg: 'recompute', sku, outcome: 'NO_PRICE', reason: decision.reason, inputsVersion: decision.inputsVersion, ruleSetVersion: decision.ruleSetVersion });
    return 'NO_PRICE';
  }
  if (state.current && !isNewer(decision, state.current)) {
    log({ msg: 'recompute', sku, outcome: 'STALE', priceMinor: decision.priceMinor, inputsVersion: decision.inputsVersion, ruleSetVersion: decision.ruleSetVersion, trace: decision.trace });
    return 'STALE';
  }
  const result = await deps.store.writePrice({
    sku,
    meta: state.meta,
    ruleSetId: state.meta.ruleSetId,
    decision,
    computedAt: new Date(now).toISOString(),
    ttlEpochSeconds: Math.floor(now / 1000) + 30 * 86400,
  });
  log({ msg: 'recompute', sku, outcome: result, priceMinor: decision.priceMinor, inputsVersion: decision.inputsVersion, ruleSetVersion: decision.ruleSetVersion, trace: decision.trace });
  return result;
}

export function createRecomputeHandler(deps: RecomputeDeps): (event: DynamoDBStreamEvent) => Promise<DynamoDBBatchResponse> {
  const log = deps.log ?? defaultLog;
  return async (event) => {
    const bySku = new Map<string, string[]>();
    for (const r of event.Records) {
      const sku = recordSku(r);
      if (sku === undefined) { log({ msg: 'recompute', outcome: 'SKIPPED_NO_SKU' }); continue; }
      const seq = r.dynamodb?.SequenceNumber;
      if (seq === undefined) continue;
      const list = bySku.get(sku) ?? [];
      list.push(seq);
      bySku.set(sku, list);
    }
    const batchItemFailures: { itemIdentifier: string }[] = [];
    for (const [sku, seqs] of bySku) {
      try {
        await recomputeSku(sku, { ...deps, log });
      } catch (e) {
        log({ msg: 'recompute', sku, outcome: 'ERROR', error: e instanceof Error ? e.message : String(e) });
        for (const s of seqs) batchItemFailures.push({ itemIdentifier: s });
      }
    }
    return { batchItemFailures };
  };
}
