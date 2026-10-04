import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startFeed } from '../src/feed.js';
import type { Price } from '../src/priceStore.js';

const p = (sku: string, inputsVersion = 1): Price => ({ sku, priceMinor: 100, currency: 'EUR', inputsVersion, ruleSetVersion: 1, computedAt: 'x' });

describe('startFeed', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  function setup(loads: Array<Price[] | Error>) {
    const subscribed: string[][] = [];
    const seen: Price[][] = [];
    const states: string[] = [];
    let n = 0;
    const feed = startFeed({
      load: async () => { const r = loads[Math.min(n++, loads.length - 1)]!; if (r instanceof Error) throw r; return r; },
      subscribe: (skus) => { subscribed.push(skus); return () => {}; },
      onRows: (rows) => seen.push(rows),
      onStatus: (s) => states.push(s),
      emptyRetryMs: 1000,
      refreshMs: 5000,
    });
    return { feed, subscribed, seen, states, calls: () => n };
  }

  it('keeps polling while the first result is empty, then subscribes and reports ready', async () => {
    const { feed, subscribed, states, calls } = setup([[], [], [p('A'), p('B')]]);
    await vi.advanceTimersByTimeAsync(0);
    expect(states).toEqual(['ready']);
    expect(subscribed).toEqual([]);
    await vi.advanceTimersByTimeAsync(2000);
    expect(calls()).toBe(3);
    expect(subscribed).toEqual([['A', 'B']]);
    feed.stop();
  });

  it('subscribes only to SKUs it has not seen and refreshes on the slow interval once rows exist', async () => {
    const { feed, subscribed, calls } = setup([[p('A')], [p('A'), p('C')]]);
    await vi.advanceTimersByTimeAsync(0);
    expect(subscribed).toEqual([['A']]);
    await vi.advanceTimersByTimeAsync(4000);
    expect(calls()).toBe(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(subscribed).toEqual([['A'], ['C']]);
    feed.stop();
  });

  it('reports an error, keeps retrying, and stops polling after stop()', async () => {
    const { feed, states, calls } = setup([new Error('down'), [p('A')]]);
    await vi.advanceTimersByTimeAsync(0);
    expect(states).toEqual(['error:down']);
    await vi.advanceTimersByTimeAsync(1000);
    expect(states).toEqual(['error:down', 'ready']);
    feed.stop();
    const before = calls();
    await vi.advanceTimersByTimeAsync(20000);
    expect(calls()).toBe(before);
  });

  it('resubscribes every known SKU on reconnect and refetches at once', async () => {
    const { feed, subscribed, calls } = setup([[p('A'), p('B')]]);
    await vi.advanceTimersByTimeAsync(0);
    feed.reconnect();
    await vi.advanceTimersByTimeAsync(0);
    expect(subscribed).toEqual([['A', 'B'], ['A', 'B']]);
    expect(calls()).toBe(2);
    feed.stop();
  });
});
