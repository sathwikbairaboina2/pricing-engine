export const DEFAULT_CONCURRENCY = 16;

/** Runs fn(0..n-1) with at most `limit` in flight. Different SKUs are independent, and same-SKU races are settled by the version condition. */
export async function mapLimit(n: number, limit: number, fn: (i: number) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= n) return;
      await fn(i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, n) }, worker));
}
