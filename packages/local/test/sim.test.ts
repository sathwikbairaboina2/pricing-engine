import { parseRuleSet } from 'pricing-rules-core';
import { describe, expect, it } from 'vitest';
import { BENCH_RULESET, DEFAULT_RULESET } from '../src/rulesets.js';
import { MapLedger, mulberry32, nextChange, type SimSource } from '../src/sim.js';

describe('mulberry32', () => {
  it('is deterministic', () => {
    const a = mulberry32(42); const b = mulberry32(42);
    const first = Array.from({ length: 5 }, () => a());
    expect(Array.from({ length: 5 }, () => b())).toEqual(first);
    expect(new Set(first).size).toBe(5);
  });
});

describe('nextChange', () => {
  const skus = ['S-1', 'S-2', 'S-3'];
  const mix = { COST: 1, COMPETITOR: 3, INVENTORY: 2 };

  it('never reuses a seq, keeps competitor within 110-180% of cost, and follows the mix', () => {
    const rng = mulberry32(7);
    const ledger = new MapLedger();
    for (const s of skus) ledger.set(s, 'COST', 1000, 1);
    const counts: Record<SimSource, number> = { COST: 0, COMPETITOR: 0, INVENTORY: 0 };
    const N = 10_000;
    for (let i = 0; i < N; i++) {
      const c = nextChange(rng, ledger, skus, mix);
      const before = ledger.get(c.sku, c.source)?.seq ?? 0;
      expect(c.seq).toBeGreaterThan(before);
      const cost = ledger.get(c.sku, 'COST')!.value;
      if (c.source === 'COMPETITOR') {
        expect(c.value).toBeGreaterThanOrEqual(Math.floor((cost * 110) / 100));
        expect(c.value).toBeLessThanOrEqual(Math.floor((cost * 180) / 100));
      }
      counts[c.source]++;
      // keep COST roughly stable so the competitor bound uses a known cost
      if (c.source !== 'COST') ledger.set(c.sku, c.source, c.value, c.seq);
    }
    const total = mix.COST + mix.COMPETITOR + mix.INVENTORY;
    for (const s of ['COST', 'COMPETITOR', 'INVENTORY'] as const) {
      expect(Math.abs(counts[s] / N - mix[s] / total)).toBeLessThan(0.05);
    }
  });
});

describe('rule sets', () => {
  it('DEFAULT_RULESET and BENCH_RULESET are valid', () => {
    expect(() => parseRuleSet(DEFAULT_RULESET)).not.toThrow();
    expect(() => parseRuleSet(BENCH_RULESET)).not.toThrow();
  });
});
