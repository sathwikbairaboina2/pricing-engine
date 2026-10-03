import type { RoundingMode } from './money.js';

export const INPUT_SOURCES = ['COST', 'COMPETITOR', 'INVENTORY', 'DEMAND'] as const;
export type InputSource = (typeof INPUT_SOURCES)[number];
export interface InputValue { value: number; seq: number }
export type Inputs = Partial<Record<InputSource, InputValue>>;
export type Condition =
  | { input: InputSource; op: 'exists' | 'missing' }
  | { input: InputSource; op: 'lt' | 'lte' | 'gt' | 'gte' | 'eq'; value: number };
export type Action = { op: 'setTo'; input: 'COST' | 'COMPETITOR'; offsetMinor: number } | { op: 'adjustBps'; bps: number };
export interface Rule { id: string; when: Condition; then: Action }
export interface RuleSet {
  id: string; version: number; currency: string; defaultMarkupBps: number;
  floor: { type: 'costPlusBps'; bps: number };
  ceiling: { type: 'multipleOfCost'; factorBps: number };
  rounding: { mode: RoundingMode; endingMinor?: number };
  maxStepBps?: number;
  rules: Rule[];
}
export interface Override { priceMinor: number; expiresAt: number; seq: number }
export interface TraceStep { ruleId: string; beforeMinor: number; afterMinor: number; note?: string }
export interface EvaluateRequest { inputs: Inputs; override?: Override; previousPriceMinor?: number; ruleSet: RuleSet; now: number }
export type PriceDecision =
  | { kind: 'PRICE'; priceMinor: number; inputsVersion: number; ruleSetVersion: number; band: { floor: number; ceiling: number }; trace: TraceStep[] }
  | { kind: 'NO_PRICE'; reason: 'MISSING_COST' | 'NON_POSITIVE_COST'; inputsVersion: number; ruleSetVersion: number; trace: TraceStep[] };
