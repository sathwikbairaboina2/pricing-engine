/** Nearest-rank percentile on an ascending array. p = 0 returns the minimum. */
export function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) throw new RangeError('percentile of an empty sample');
  if (!(p >= 0 && p <= 100)) throw new RangeError(`percentile ${p} outside 0..100`);
  if (p === 0) return sortedAsc[0]!;
  return sortedAsc[Math.ceil((p / 100) * sortedAsc.length) - 1]!;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function summarize(samples: number[]): { count: number; p50: number; p95: number; p99: number; max: number; mean: number } {
  const sorted = [...samples].sort((a, b) => a - b);
  const mean = sorted.reduce((s, n) => s + n, 0) / sorted.length;
  return {
    count: sorted.length,
    p50: round1(percentile(sorted, 50)),
    p95: round1(percentile(sorted, 95)),
    p99: round1(percentile(sorted, 99)),
    max: round1(sorted[sorted.length - 1]!),
    mean: round1(mean),
  };
}

/** Always differs from benchValue(n - 1) and stays inside the bench band [1000, 10000] for COST 1000. */
export function benchValue(n: number): number {
  return 1100 + (n % 800);
}

export interface SentSample { at: number; value: number; sku: string; inputsVersion: number }

/**
 * Splits sent updates into delivered, superseded and lost. The recompute handler prices the latest stored state (ADR 0004),
 * so a missing (sku, version) followed by a newer received version of the same SKU was coalesced, not lost.
 */
export function classifySamples(
  sent: Map<string, SentSample>,
  received: Map<string, { at: number; priceMinor: number }>,
  newest: Map<string, { inputsVersion: number; at: number }>,
): { latencies: number[]; supersededLatencies: number[]; mismatches: number; lost: number } {
  const latencies: number[] = [];
  const supersededLatencies: number[] = [];
  let mismatches = 0;
  let lost = 0;
  for (const [key, s] of sent) {
    const r = received.get(key);
    if (r) {
      latencies.push(r.at - s.at);
      if (r.priceMinor !== s.value) mismatches++;
      continue;
    }
    const later = newest.get(s.sku);
    if (later && later.inputsVersion > s.inputsVersion) supersededLatencies.push(later.at - s.at);
    else lost++;
  }
  return { latencies, supersededLatencies, mismatches, lost };
}
