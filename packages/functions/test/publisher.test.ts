import { describe, expect, it } from 'vitest';
import { createPublisherHandler, type PriceMessage } from '../src/publisher.js';
import { event, priceRecord } from './support/events.js';

const price = (priceMinor: number) => ({
  priceMinor, currency: 'EUR', inputsVersion: 3, ruleSetVersion: 1, computedAt: '2026-10-04T00:00:00.000Z', category: 'tools',
  decisionTrace: [{ ruleId: 'base', beforeMinor: 1, afterMinor: 2 }], GSI1PK: 'CATEGORY#tools', GSI1SK: 'SKU#A',
});

function setup(failOn?: (m: PriceMessage, n: number) => boolean) {
  const published: PriceMessage[] = [];
  let calls = 0;
  const publisher = {
    publish: async (m: PriceMessage) => {
      const n = ++calls;
      if (failOn?.(m, n)) throw new Error('boom');
      published.push(m);
    },
  };
  return { published, handler: createPublisherHandler({ publisher, log: () => {} }) };
}

describe('publisher handler', () => {
  it('publishes an INSERT with exactly six fields', async () => {
    const { handler, published } = setup();
    await handler(event(priceRecord('A', undefined, price(1299), '1')));
    expect(published).toHaveLength(1);
    expect(Object.keys(published[0]!).sort()).toEqual(['computedAt', 'currency', 'inputsVersion', 'priceMinor', 'ruleSetVersion', 'sku']);
  });
  it('skips a MODIFY with the same price', async () => {
    const { handler, published } = setup();
    await handler(event(priceRecord('A', price(1299), { ...price(1299), inputsVersion: 4 }, '1')));
    expect(published).toHaveLength(0);
  });
  it('publishes a MODIFY with a changed price', async () => {
    const { handler, published } = setup();
    await handler(event(priceRecord('A', price(1299), price(1399), '1')));
    expect(published).toHaveLength(1);
  });
  it('skips REMOVE', async () => {
    const { handler, published } = setup();
    await handler(event(priceRecord('A', price(1299), price(1299), '1', 'REMOVE')));
    expect(published).toHaveLength(0);
  });
  it('reports only the failing record', async () => {
    const { handler, published } = setup((_m, n) => n === 2);
    const res = await handler(event(
      priceRecord('A', undefined, price(1), '1'), priceRecord('B', undefined, price(2), '2'), priceRecord('C', undefined, price(3), '3'),
    ));
    expect(res.batchItemFailures).toEqual([{ itemIdentifier: '2' }]);
    expect(published.map((m) => m.priceMinor)).toEqual([1, 3]);
  });
  it('is at-least-once itself: a replayed MODIFY publishes again', async () => {
    const { handler, published } = setup();
    const ev = event(priceRecord('A', price(1299), price(1399), '1'));
    for (let i = 0; i < 3; i++) await handler(ev);
    expect(published).toHaveLength(3);
  });
});
