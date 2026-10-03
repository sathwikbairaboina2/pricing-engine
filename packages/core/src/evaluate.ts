import { assertMinor, assertSafeInt, ceilMulDiv, floorMulDiv, MAX_MINOR, mulDivRound, saturate } from './money.js';
import { snapToEnding } from './ending.js';
import { INPUT_SOURCES, type Condition, type EvaluateRequest, type Inputs, type Override, type PriceDecision, type TraceStep } from './types.js';

const BPS = 10000;

export function computeInputsVersion(inputs: Inputs, override?: Override): number {
  let v = override?.seq ?? 0;
  for (const s of INPUT_SOURCES) v += inputs[s]?.seq ?? 0;
  return v;
}

function checkRequest(req: EvaluateRequest): void {
  for (const s of INPUT_SOURCES) {
    const iv = req.inputs[s];
    if (!iv) continue;
    assertSafeInt(iv.seq, `${s}.seq`, 0, Number.MAX_SAFE_INTEGER);
    if (s === 'COST' || s === 'COMPETITOR') assertMinor(iv.value, `${s}.value`);
    else assertSafeInt(iv.value, `${s}.value`, -MAX_MINOR, MAX_MINOR);
  }
  if (req.previousPriceMinor !== undefined) assertMinor(req.previousPriceMinor, 'previousPriceMinor');
  if (req.override) { assertMinor(req.override.priceMinor, 'override.priceMinor'); assertSafeInt(req.override.seq, 'override.seq', 0, Number.MAX_SAFE_INTEGER); }
}

function holds(c: Condition, inputs: Inputs): boolean {
  const iv = inputs[c.input];
  if (c.op === 'exists') return iv !== undefined;
  if (c.op === 'missing') return iv === undefined;
  if (iv === undefined) return false;
  switch (c.op) {
    case 'lt': return iv.value < c.value;
    case 'lte': return iv.value <= c.value;
    case 'gt': return iv.value > c.value;
    case 'gte': return iv.value >= c.value;
    case 'eq': return iv.value === c.value;
  }
}

export function evaluate(req: EvaluateRequest): PriceDecision {
  checkRequest(req);
  const { inputs, override, previousPriceMinor, ruleSet, now } = req;
  const inputsVersion = computeInputsVersion(inputs, override);
  const ruleSetVersion = ruleSet.version;
  const cost = inputs.COST?.value;
  if (cost === undefined) return { kind: 'NO_PRICE', reason: 'MISSING_COST', inputsVersion, ruleSetVersion, trace: [] };
  if (cost <= 0) return { kind: 'NO_PRICE', reason: 'NON_POSITIVE_COST', inputsVersion, ruleSetVersion, trace: [] };
  const mode = ruleSet.rounding.mode;
  const trace: TraceStep[] = [];

  const floor = ceilMulDiv(cost, BPS + ruleSet.floor.bps, BPS);
  const rawCeiling = floorMulDiv(cost, ruleSet.ceiling.factorBps, BPS);
  const ceiling = Math.max(floor, rawCeiling);
  if (ceiling !== rawCeiling) trace.push({ ruleId: 'band', beforeMinor: rawCeiling, afterMinor: ceiling, note: 'ceiling raised to floor' });

  let price = saturate(cost + mulDivRound(cost, ruleSet.defaultMarkupBps, BPS, mode), 0, MAX_MINOR);
  trace.push({ ruleId: 'base', beforeMinor: cost, afterMinor: price });

  for (const rule of ruleSet.rules) {
    if (!holds(rule.when, inputs)) continue;
    const before = price;
    if (rule.then.op === 'setTo') {
      const src = inputs[rule.then.input];
      if (!src) { trace.push({ ruleId: rule.id, beforeMinor: before, afterMinor: before, note: 'input missing' }); continue; }
      price = src.value + rule.then.offsetMinor;
    } else {
      price = price + mulDivRound(price, rule.then.bps, BPS, mode);
    }
    price = saturate(price, 0, MAX_MINOR);
    trace.push({ ruleId: rule.id, beforeMinor: before, afterMinor: price });
  }

  const overrideActive = override !== undefined && override.expiresAt > now;
  if (overrideActive) { trace.push({ ruleId: 'override', beforeMinor: price, afterMinor: override.priceMinor }); price = override.priceMinor; }

  let lo = floor;
  let hi = ceiling;
  if (previousPriceMinor !== undefined && !overrideActive && ruleSet.maxStepBps !== undefined) {
    const step = floorMulDiv(previousPriceMinor, ruleSet.maxStepBps, BPS);
    const sLo = Math.max(lo, previousPriceMinor - step);
    const sHi = Math.min(hi, previousPriceMinor + step);
    if (sLo <= sHi) { lo = sLo; hi = sHi; }
    else trace.push({ ruleId: 'step', beforeMinor: price, afterMinor: price, note: 'step limit skipped: outside band' });
  }

  const clamped = saturate(price, lo, hi);
  if (clamped !== price) trace.push({ ruleId: 'clamp', beforeMinor: price, afterMinor: clamped });
  price = clamped;

  const ending = ruleSet.rounding.endingMinor;
  if (ending !== undefined) {
    const snapped = snapToEnding(price, lo, hi, ending);
    if (snapped === undefined) trace.push({ ruleId: 'ending', beforeMinor: price, afterMinor: price, note: 'ending skipped: no candidate in interval' });
    else { if (snapped !== price) trace.push({ ruleId: 'ending', beforeMinor: price, afterMinor: snapped }); price = snapped; }
  }
  return { kind: 'PRICE', priceMinor: price, inputsVersion, ruleSetVersion, band: { floor, ceiling }, trace };
}
