export type RoundingMode = 'HALF_EVEN' | 'HALF_UP';
export const MAX_MINOR = 1_000_000_000_000;

export function assertSafeInt(n: number, name: string, min: number, max: number): void {
  if (!Number.isSafeInteger(n) || n < min || n > max) {
    throw new RangeError(`${name} must be an integer in [${min}, ${max}], got ${n}`);
  }
}
export function assertMinor(n: number, name: string): void { assertSafeInt(n, name, 0, MAX_MINOR); }

function toSafe(b: bigint): number {
  if (b > BigInt(Number.MAX_SAFE_INTEGER) || b < BigInt(Number.MIN_SAFE_INTEGER)) throw new RangeError('result is not a safe integer');
  return Number(b);
}
function checkOperands(a: number, b: number, d: number): void {
  if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b)) throw new RangeError('operands must be safe integers');
  if (!Number.isSafeInteger(d) || d <= 0) throw new RangeError('divisor must be a positive safe integer');
}

export function mulDivRound(a: number, b: number, d: number, mode: RoundingMode): number {
  checkOperands(a, b, d);
  const n = BigInt(a) * BigInt(b);
  const D = BigInt(d);
  const neg = n < 0n;
  const abs = neg ? -n : n;
  let q = abs / D;
  const twice = (abs % D) * 2n;
  if (twice > D || (twice === D && (mode === 'HALF_UP' || q % 2n === 1n))) q += 1n;
  return toSafe(neg ? -q : q);
}
export function ceilMulDiv(a: number, b: number, d: number): number {
  checkOperands(a, b, d);
  if (a < 0 || b < 0) throw new RangeError('ceilMulDiv needs non-negative operands');
  const n = BigInt(a) * BigInt(b);
  const D = BigInt(d);
  return toSafe((n + D - 1n) / D);
}
export function floorMulDiv(a: number, b: number, d: number): number {
  checkOperands(a, b, d);
  if (a < 0 || b < 0) throw new RangeError('floorMulDiv needs non-negative operands');
  return toSafe((BigInt(a) * BigInt(b)) / BigInt(d));
}
export function saturate(n: number, lo: number, hi: number): number { return Math.min(hi, Math.max(lo, n)); }
