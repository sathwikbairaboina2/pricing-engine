import { Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { PUBLISHER_FILTERS, RECOMPUTE_FILTERS } from '@pricing-engine/functions';
import { buildApp } from '../src/app.js';

const template = Template.fromStack(buildApp({ nag: false }).stack);
const mappings = Object.values(template.findResources('AWS::Lambda::EventSourceMapping')) as Array<{ Properties: Record<string, any> }>; // eslint-disable-line @typescript-eslint/no-explicit-any

const patterns = (m: { Properties: Record<string, any> }) => // eslint-disable-line @typescript-eslint/no-explicit-any
  (m.Properties['FilterCriteria'].Filters as Array<{ Pattern: string }>).map((f) => f.Pattern);

describe('event source mappings', () => {
  it('has exactly two with retry, bisect, partial-failure reporting and a DLQ', () => {
    expect(mappings).toHaveLength(2);
    for (const m of mappings) {
      expect(m.Properties['BisectBatchOnFunctionError']).toBe(true);
      expect(m.Properties['MaximumRetryAttempts']).toBe(3);
      expect(m.Properties['FunctionResponseTypes']).toEqual(['ReportBatchItemFailures']);
      expect(m.Properties['StartingPosition']).toBe('LATEST');
      expect(m.Properties['DestinationConfig'].OnFailure.Destination).toBeDefined();
    }
  });
  it('uses exactly the shared filters', () => {
    const all = mappings.map(patterns);
    expect(all).toContainEqual(RECOMPUTE_FILTERS.map((f) => JSON.stringify(f)));
    expect(all).toContainEqual(PUBLISHER_FILTERS.map((f) => JSON.stringify(f)));
  });
});
