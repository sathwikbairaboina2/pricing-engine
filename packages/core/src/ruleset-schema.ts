import { INPUT_SOURCES } from './types.js';

const idPattern = '^[a-z0-9-]{1,64}$';

export const ruleSetSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  additionalProperties: false,
  required: ['id', 'version', 'currency', 'defaultMarkupBps', 'floor', 'ceiling', 'rounding', 'rules'],
  properties: {
    id: { type: 'string', pattern: idPattern },
    version: { type: 'integer', minimum: 1 },
    currency: { type: 'string', pattern: '^[A-Z]{3}$' },
    defaultMarkupBps: { type: 'integer', minimum: 0, maximum: 100000 },
    floor: {
      type: 'object', additionalProperties: false, required: ['type', 'bps'],
      properties: { type: { const: 'costPlusBps' }, bps: { type: 'integer', minimum: 0, maximum: 100000 } },
    },
    ceiling: {
      type: 'object', additionalProperties: false, required: ['type', 'factorBps'],
      properties: { type: { const: 'multipleOfCost' }, factorBps: { type: 'integer', minimum: 10000, maximum: 1000000 } },
    },
    rounding: {
      type: 'object', additionalProperties: false, required: ['mode'],
      properties: {
        mode: { enum: ['HALF_EVEN', 'HALF_UP'] },
        endingMinor: { type: 'integer', minimum: 0, maximum: 99 },
      },
    },
    maxStepBps: { type: 'integer', minimum: 1, maximum: 10000 },
    rules: { type: 'array', maxItems: 50, items: { $ref: '#/$defs/rule' } },
  },
  $defs: {
    source: { enum: [...INPUT_SOURCES] },
    rule: {
      type: 'object', additionalProperties: false, required: ['id', 'when', 'then'],
      properties: {
        id: { type: 'string', pattern: idPattern },
        when: { $ref: '#/$defs/condition' },
        then: { $ref: '#/$defs/action' },
      },
    },
    condition: {
      oneOf: [
        {
          type: 'object', additionalProperties: false, required: ['input', 'op'],
          properties: { input: { $ref: '#/$defs/source' }, op: { enum: ['exists', 'missing'] } },
        },
        {
          type: 'object', additionalProperties: false, required: ['input', 'op', 'value'],
          properties: { input: { $ref: '#/$defs/source' }, op: { enum: ['lt', 'lte', 'gt', 'gte', 'eq'] }, value: { type: 'integer' } },
        },
      ],
    },
    action: {
      oneOf: [
        {
          type: 'object', additionalProperties: false, required: ['op', 'input', 'offsetMinor'],
          properties: {
            op: { const: 'setTo' }, input: { enum: ['COST', 'COMPETITOR'] },
            offsetMinor: { type: 'integer', minimum: -1000000000000, maximum: 1000000000000 },
          },
        },
        {
          type: 'object', additionalProperties: false, required: ['op', 'bps'],
          properties: { op: { const: 'adjustBps' }, bps: { type: 'integer', minimum: -10000, maximum: 100000 } },
        },
      ],
    },
  },
} as const;
