export interface Price { sku: string; priceMinor: number; currency: string; inputsVersion: number; ruleSetVersion: number; computedAt: string }
export interface PriceRow extends Price { previousMinor?: number; changedAt?: number }
export type Rows = Readonly<Record<string, PriceRow>>;

function isNewer(a: Price, b: Price): boolean {
  return a.inputsVersion > b.inputsVersion || (a.inputsVersion === b.inputsVersion && a.ruleSetVersion > b.ruleSetVersion);
}

/** Returns the same object when p is not newer, so duplicate or out-of-order publisher retries are ignored. */
export function applyPrice(rows: Rows, p: Price, nowMs: number): Rows {
  const existing = rows[p.sku];
  if (!existing) return { ...rows, [p.sku]: { ...p } };
  if (!isNewer(p, existing)) return rows;
  return { ...rows, [p.sku]: { ...p, previousMinor: existing.priceMinor, changedAt: nowMs } };
}

export function direction(row: PriceRow): 'up' | 'down' | 'none' {
  if (row.previousMinor === undefined || row.previousMinor === row.priceMinor) return 'none';
  return row.priceMinor > row.previousMinor ? 'up' : 'down';
}

/** Display only: the engine never touches floats. */
export function formatMinor(minor: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(minor / 100);
}
