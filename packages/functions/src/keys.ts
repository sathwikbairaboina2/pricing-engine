import type { InputSource } from 'pricing-rules-core';

export class InvalidSkuError extends Error {
  constructor(sku: string) {
    super(`invalid sku: ${JSON.stringify(sku.length > 80 ? `${sku.slice(0, 80)}...` : sku)}`);
    this.name = 'InvalidSkuError';
  }
}

export const SKU_RE = /^[A-Za-z0-9-]{1,64}$/;

export function assertSku(sku: string): void {
  if (typeof sku !== 'string' || !SKU_RE.test(sku)) throw new InvalidSkuError(String(sku));
}
export function skuPk(sku: string): string { assertSku(sku); return `SKU#${sku}`; }
export function histPk(sku: string): string { assertSku(sku); return `HIST#${sku}`; }
export function histSk(inputsVersion: number, ruleSetVersion: number): string { return `v${inputsVersion}#r${ruleSetVersion}`; }
export function ruleSetPk(id: string): string { return `RULESET#${id}`; }
export const SK = { META: 'META', OVERRIDE: 'OVERRIDE', PRICE_CURRENT: 'PRICE#CURRENT', ACTIVE: 'ACTIVE' } as const;
export function inputSk(source: InputSource): string { return `INPUT#${source}`; }
export function ruleSetVersionSk(v: number): string { return `v${v}`; }
export function categoryPk(category: string): string { return `CATEGORY#${category}`; }
