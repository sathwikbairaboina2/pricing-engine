import { InvalidRuleSetError, type RuleSet } from 'pricing-rules-core';
import { beforeEach, describe, expect, it } from 'vitest';
import { createRecomputeHandler } from '../src/recompute.js';
import { event, inputRecord, rawRecord } from './support/events.js';
import { MemoryStore } from './support/memory-store.js';

const ruleSet: RuleSet = {
  id: 'default', version: 1, currency: 'EUR', defaultMarkupBps: 2500,
  floor: { type: 'costPlusBps', bps: 500 }, ceiling: { type: 'multipleOfCost', factorBps: 30000 },
  rounding: { mode: 'HALF_EVEN', endingMinor: 99 }, maxStepBps: 1500,
  rules: [
    { id: 'match-competitor', when: { input: 'COMPETITOR', op: 'exists' }, then: { op: 'setTo', input: 'COMPETITOR', offsetMinor: -10 } },
    { id: 'low-stock-surge', when: { input: 'INVENTORY', op: 'lt', value: 20 }, then: { op: 'adjustBps', bps: 800 } },
  ],
};
const meta = { name: 'Widget', category: 'tools', currency: 'EUR', ruleSetId: 'default' };
const NOW = 1_700_000_000_000;

let store: MemoryStore;
let logs: Record<string, unknown>[];
const handler = () => createRecomputeHandler({ store, now: () => NOW, log: (e) => logs.push(e) });

beforeEach(() => {
  store = new MemoryStore();
  store.setRuleSet(ruleSet);
  store.seed('A', meta, { COST: { value: 1000, seq: 1 }, COMPETITOR: { value: 1500, seq: 2 } });
  logs = [];
});

describe('recompute handler', () => {
  it('writes the evaluated price for an input record', async () => {
    const res = await handler()(event(inputRecord('A', 'COST', '1')));
    expect(res.batchItemFailures).toEqual([]);
    expect(store.history).toHaveLength(1);
    expect(store.current('A')).toMatchObject({ priceMinor: 1499, inputsVersion: 3, ruleSetVersion: 1 });
  });
  it('is idempotent: the same event three times writes once', async () => {
    const h = handler();
    for (let i = 0; i < 3; i++) await h(event(inputRecord('A', 'COST', '1')));
    expect(store.history).toHaveLength(1);
  });
  it('recomputes a SKU once per batch', async () => {
    await handler()(event(inputRecord('A', 'COST', '1'), inputRecord('A', 'COMPETITOR', '2'), inputRecord('A', 'INVENTORY', '3')));
    expect(store.writeCalls).toBe(1);
  });
  it('acks a SKU without META', async () => {
    const res = await handler()(event(inputRecord('ZZ', 'COST', '1')));
    expect(res.batchItemFailures).toEqual([]);
    expect(store.writeCalls).toBe(0);
  });
  it('acks without writing when COST is 0 (no price)', async () => {
    store.seed('B', meta, { COST: { value: 0, seq: 1 } });
    const res = await handler()(event(inputRecord('B', 'COST', '1')));
    expect(res.batchItemFailures).toEqual([]);
    expect(store.writeCalls).toBe(0);
  });
  it('fails only the records of the SKU whose write throws', async () => {
    store.seed('B', meta, { COST: { value: 1000, seq: 1 } });
    // A writes first (first-seen order), so fail the second write, which belongs to B.
    const h = handler();
    const orig = store.writePrice.bind(store);
    store.writePrice = async (w) => { if (w.sku === 'B') throw new Error('throttled'); return orig(w); };
    const res = await h(event(inputRecord('A', 'COST', '10'), inputRecord('B', 'COST', '11'), inputRecord('B', 'COMPETITOR', '12')));
    expect(res.batchItemFailures).toEqual([{ itemIdentifier: '11' }, { itemIdentifier: '12' }]);
    expect(store.current('A')).toBeDefined();
  });
  it('reports records in failures when the rule set is invalid', async () => {
    store.failRuleSets(new InvalidRuleSetError([{ pointer: '/defaultMarkupBps', message: 'must be integer' }]));
    const res = await handler()(event(inputRecord('A', 'COST', '5')));
    expect(res.batchItemFailures).toEqual([{ itemIdentifier: '5' }]);
    expect(store.writeCalls).toBe(0);
  });
  it('acks records that carry no SKU', async () => {
    const res = await handler()(event(rawRecord('RULESET#x', 'ACTIVE', '9')));
    expect(res.batchItemFailures).toEqual([]);
    expect(store.writeCalls).toBe(0);
  });
  it('logs a recompute entry with the trace', async () => {
    await handler()(event(inputRecord('A', 'COST', '1')));
    const entry = logs.find((l) => l['msg'] === 'recompute' && l['outcome'] === 'WRITTEN');
    expect(Array.isArray(entry?.['trace'])).toBe(true);
  });
});
