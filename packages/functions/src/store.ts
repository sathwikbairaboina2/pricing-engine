import type { Inputs, Override, PriceDecision, RuleSet } from 'pricing-rules-core';

export interface SkuMeta { name: string; category: string; currency: string; ruleSetId: string }
export interface CurrentPrice { priceMinor: number; inputsVersion: number; ruleSetVersion: number; computedAt: string }
export interface SkuState { sku: string; meta: SkuMeta; inputs: Inputs; override?: Override; current?: CurrentPrice }
export type PricedDecision = Extract<PriceDecision, { kind: 'PRICE' }>;
export interface PriceWrite { sku: string; meta: SkuMeta; ruleSetId: string; decision: PricedDecision; computedAt: string; ttlEpochSeconds: number }
export type WriteResult = 'WRITTEN' | 'STALE';

export interface PricingStore {
  /** undefined when the SKU's META item is missing */
  loadSku(sku: string): Promise<SkuState | undefined>;
  /** throws InvalidRuleSetError / RuleSetNotFoundError */
  loadActiveRuleSet(ruleSetId: string): Promise<RuleSet>;
  writePrice(w: PriceWrite): Promise<WriteResult>;
}

export class RuleSetNotFoundError extends Error {
  constructor(public readonly ruleSetId: string) {
    super(`rule set not found: ${ruleSetId}`);
    this.name = 'RuleSetNotFoundError';
  }
}

type Version = { inputsVersion: number; ruleSetVersion: number };
/** True when a is strictly newer than b, comparing (inputsVersion, ruleSetVersion) lexicographically. */
export function isNewer(a: Version, b: Version): boolean {
  return a.inputsVersion > b.inputsVersion || (a.inputsVersion === b.inputsVersion && a.ruleSetVersion > b.ruleSetVersion);
}
