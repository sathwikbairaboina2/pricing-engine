import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DynamoDBRecord, DynamoDBStreamEvent } from 'aws-lambda';
import { describe, expect, it } from 'vitest';
import { deliver, jsonlDeadLetter, type DeliveryOptions } from '../src/deliver.js';

const records = (n: number): DynamoDBRecord[] => Array.from({ length: n }, (_, i) => ({ eventName: 'MODIFY', dynamodb: { SequenceNumber: String(i + 1) } }));
const seqs = (e: DynamoDBStreamEvent) => e.Records.map((r) => r.dynamodb!.SequenceNumber!);

function opts() {
  const parked: string[][] = [];
  const o: DeliveryOptions = { maxRetries: 3, bisectOnError: true, onDeadLetter: async (rs) => { parked.push(rs.map((r) => r.dynamodb!.SequenceNumber!)); } };
  return { o, parked };
}

describe('deliver', () => {
  it('(a) succeeds in one invocation', async () => {
    const { o } = opts();
    const res = await deliver(records(4), async () => ({ batchItemFailures: [] }), o);
    expect(res).toEqual({ invocations: 1, deadLettered: 0 });
  });
  it('(b) retries from the failed record onward', async () => {
    const { o } = opts();
    const calls: string[][] = [];
    await deliver(records(4), async (e) => {
      calls.push(seqs(e));
      return calls.length === 1 ? { batchItemFailures: [{ itemIdentifier: '2' }] } : { batchItemFailures: [] };
    }, o);
    expect(calls).toEqual([['1', '2', '3', '4'], ['2', '3', '4']]);
  });
  it('(c) bisects around a poison record and parks only that one (Review Focus 4)', async () => {
    const { o, parked } = opts();
    const delivered = new Set<string>();
    const res = await deliver(records(8), async (e) => {
      if (seqs(e).includes('5')) throw new Error('poison');
      for (const s of seqs(e)) delivered.add(s);
    }, o);
    expect(parked).toEqual([['5']]);
    expect([...delivered].sort()).toEqual(['1', '2', '3', '4', '6', '7', '8']);
    expect(res.deadLettered).toBe(1);
  });
  it('(d) parks a record that always reports failure after exactly 1 + maxRetries invocations', async () => {
    const { o, parked } = opts();
    let n = 0;
    const res = await deliver(records(1), async () => { n++; return { batchItemFailures: [{ itemIdentifier: '1' }] }; }, o);
    expect(n).toBe(4);
    expect(res).toEqual({ invocations: 4, deadLettered: 1 });
    expect(parked).toEqual([['1']]);
  });
  it('(e) jsonlDeadLetter writes one line per record', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'dlq-')), 'nested', 'recompute.jsonl');
    await jsonlDeadLetter(file)(records(2), 'because');
    const lines = readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ reason: 'because', record: { dynamodb: { SequenceNumber: '1' } } });
  });
});
