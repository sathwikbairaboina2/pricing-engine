import { mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluate } from '../src/evaluate.js';
import type { EvaluateRequest, RuleSet } from '../src/types.js';

const ruleSet: RuleSet = {
  id: 'default', version: 1, currency: 'EUR', defaultMarkupBps: 2500,
  floor: { type: 'costPlusBps', bps: 500 }, ceiling: { type: 'multipleOfCost', factorBps: 30000 },
  rounding: { mode: 'HALF_EVEN', endingMinor: 99 }, maxStepBps: 1500,
  rules: [
    { id: 'match-competitor', when: { input: 'COMPETITOR', op: 'exists' }, then: { op: 'setTo', input: 'COMPETITOR', offsetMinor: -10 } },
    { id: 'low-stock-surge', when: { input: 'INVENTORY', op: 'lt', value: 20 }, then: { op: 'adjustBps', bps: 800 } },
  ],
};

const requests: EvaluateRequest[] = Array.from({ length: 1000 }, (_, i) => ({
  inputs: {
    COST: { value: 500 + ((i * 37) % 9000), seq: 1 + (i % 5) },
    ...(i % 2 === 0 ? { COMPETITOR: { value: 700 + ((i * 53) % 12000), seq: 1 + (i % 7) } } : {}),
    ...(i % 3 === 0 ? { INVENTORY: { value: (i * 7) % 60, seq: 1 } } : {}),
  },
  ...(i % 4 === 0 ? { previousPriceMinor: 1000 + ((i * 91) % 8000) } : {}),
  ruleSet,
  now: 1_700_000_000_000,
}));

for (let i = 0; i < 10_000; i++) evaluate(requests[i % requests.length]!);

const CALLS = 100_000;
const samples = new Float64Array(CALLS);
const t0 = performance.now();
for (let i = 0; i < CALLS; i++) {
  const s = performance.now();
  evaluate(requests[i % requests.length]!);
  samples[i] = performance.now() - s;
}
const totalMs = performance.now() - t0;
const sorted = Float64Array.from(samples).sort();
const us = (p: number) => Math.round(sorted[Math.min(CALLS - 1, Math.floor(CALLS * p))]! * 1000 * 100) / 100;
const result = {
  kind: 'core-evaluate',
  at: new Date().toISOString(),
  calls: CALLS,
  callsPerSec: Math.round(CALLS / (totalMs / 1000)),
  p50Us: us(0.5),
  p99Us: us(0.99),
  maxUs: Math.round(sorted[CALLS - 1]! * 1000 * 100) / 100,
  node: process.version,
  cpu: os.cpus()[0]?.model,
  platform: os.platform(),
};
const out = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'bench', 'results', 'core-latest.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(result, null, 2) + '\n');
console.log(`evaluate(): ${result.callsPerSec} calls/s, p50 ${result.p50Us} us, p99 ${result.p99Us} us`);
