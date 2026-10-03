import { Ajv2020 } from 'ajv/dist/2020.js';
import { ruleSetSchema } from './ruleset-schema.js';
import type { RuleSet } from './types.js';

export interface RuleSetError { pointer: string; message: string }
export type RuleSetValidation = { ok: true; ruleSet: RuleSet } | { ok: false; errors: RuleSetError[] };

const ajv = new Ajv2020({ allErrors: true, strict: true });
const check = ajv.compile(ruleSetSchema);

export function validateRuleSet(input: unknown): RuleSetValidation {
  if (!check(input)) {
    const errors = (check.errors ?? []).map((e) => {
      let message = e.message ?? 'invalid';
      if (e.keyword === 'additionalProperties') message += `: ${String(e.params['additionalProperty'])}`;
      return { pointer: e.instancePath || '/', message };
    });
    return { ok: false, errors };
  }
  const rs = input as unknown as RuleSet;
  const errors: RuleSetError[] = [];
  const seen = new Set<string>();
  rs.rules.forEach((r, i) => {
    if (seen.has(r.id)) errors.push({ pointer: `/rules/${i}/id`, message: `duplicate rule id "${r.id}"` });
    seen.add(r.id);
  });
  const min = 10000 + rs.floor.bps;
  if (rs.ceiling.factorBps < min) {
    errors.push({ pointer: '/ceiling/factorBps', message: `must be >= ${min} (100% + floor.bps)` });
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, ruleSet: rs };
}

export class InvalidRuleSetError extends Error {
  constructor(public readonly errors: RuleSetError[]) {
    super(`invalid rule set: ${errors.map((e) => `${e.pointer} ${e.message}`).join('; ')}`);
    this.name = 'InvalidRuleSetError';
  }
}

export function parseRuleSet(input: unknown): RuleSet {
  const r = validateRuleSet(input);
  if (!r.ok) throw new InvalidRuleSetError(r.errors);
  return r.ruleSet;
}
