import type { Inputs, Override, RuleSet } from 'pricing-rules-core';
import { isNewer, RuleSetNotFoundError, type CurrentPrice, type PriceWrite, type PricingStore, type SkuMeta, type SkuState, type WriteResult } from '../../src/store.js';

export class MemoryStore implements PricingStore {
  readonly history: PriceWrite[] = [];
  writeCalls = 0;
  private skus = new Map<string, { meta: SkuMeta; inputs: Inputs; override?: Override; current?: CurrentPrice }>();
  private ruleSets = new Map<string, RuleSet>();
  private nextWriteError: Error | undefined;
  private ruleSetError: Error | undefined;

  seed(sku: string, meta: SkuMeta, inputs: Inputs, override?: Override): void {
    this.skus.set(sku, { meta, inputs, ...(override ? { override } : {}) });
  }
  setInputs(sku: string, inputs: Inputs): void { const s = this.skus.get(sku); if (s) s.inputs = inputs; }
  setRuleSet(rs: RuleSet): void { this.ruleSets.set(rs.id, rs); }
  failNextWrite(err: Error): void { this.nextWriteError = err; }
  failRuleSets(err: Error | undefined): void { this.ruleSetError = err; }

  async loadSku(sku: string): Promise<SkuState | undefined> {
    const s = this.skus.get(sku);
    if (!s) return undefined;
    return { sku, meta: s.meta, inputs: s.inputs, ...(s.override ? { override: s.override } : {}), ...(s.current ? { current: s.current } : {}) };
  }
  async loadActiveRuleSet(id: string): Promise<RuleSet> {
    if (this.ruleSetError) throw this.ruleSetError;
    const rs = this.ruleSets.get(id);
    if (!rs) throw new RuleSetNotFoundError(id);
    return rs;
  }
  async writePrice(w: PriceWrite): Promise<WriteResult> {
    this.writeCalls++;
    if (this.nextWriteError) { const e = this.nextWriteError; this.nextWriteError = undefined; throw e; }
    const s = this.skus.get(w.sku);
    if (!s) throw new Error('no such sku');
    if (s.current && !isNewer(w.decision, s.current)) return 'STALE';
    s.current = { priceMinor: w.decision.priceMinor, inputsVersion: w.decision.inputsVersion, ruleSetVersion: w.decision.ruleSetVersion, computedAt: w.computedAt };
    this.history.push(w);
    return 'WRITTEN';
  }
  current(sku: string): CurrentPrice | undefined { return this.skus.get(sku)?.current; }
}
