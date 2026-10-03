export function snapToEnding(price: number, lo: number, hi: number, endingMinor: number): number | undefined {
  const below = price - ((((price - endingMinor) % 100) + 100) % 100);
  const above = below === price ? price : below + 100;
  const fits = [below, above].filter((c) => c >= lo && c <= hi);
  if (fits.length === 0) return undefined;
  if (fits.length === 1) return fits[0];
  return price - below <= above - price ? below : above;
}
