import type { DynamoDBStreamsClient } from '@aws-sdk/client-dynamodb-streams';
import { describe, expect, it } from 'vitest';
import { StreamReader, toLambdaRecord } from '../src/stream-reader.js';

const ARN = 'arn:aws:dynamodb:local:000000000000:table/T/stream/x';
const rec = (seq: string) => ({
  eventID: seq, eventName: 'INSERT', eventVersion: '1.1', awsRegion: 'local',
  dynamodb: { Keys: { PK: { S: 'SKU#A' }, SK: { S: 'INPUT#COST' } }, SequenceNumber: seq, ApproximateCreationDateTime: new Date(1_700_000_000_123) },
});

type Handler = (name: string, input: Record<string, any>) => unknown; // eslint-disable-line @typescript-eslint/no-explicit-any
function fake(handler: Handler) {
  const calls: string[] = [];
  const streams = { send: async (cmd: { constructor: { name: string }; input: Record<string, unknown> }) => { calls.push(cmd.constructor.name); return handler(cmd.constructor.name, cmd.input); } };
  return { streams: streams as unknown as DynamoDBStreamsClient, calls };
}
const wait = async (cond: () => boolean, ms = 2000) => { const end = Date.now() + ms; while (!cond() && Date.now() < end) await new Promise((r) => setTimeout(r, 5)); };

describe('StreamReader', () => {
  it('(a) delivers a shard in order and polls again immediately after a non-empty response', async () => {
    let n = 0;
    const { streams, calls } = fake((name) => {
      if (name === 'DescribeStreamCommand') return { StreamDescription: { Shards: [{ ShardId: 's1' }] } };
      if (name === 'GetShardIteratorCommand') return { ShardIterator: 'it0' };
      n++;
      if (n === 1) return { Records: [rec('1'), rec('2')], NextShardIterator: 'it1' };
      if (n === 2) return { Records: [rec('3')], NextShardIterator: 'it2' };
      return { Records: [], NextShardIterator: 'it3' };
    });
    const got: string[] = [];
    const reader = new StreamReader({ streams, streamArn: ARN, pollIntervalMs: 500, startAt: 'TRIM_HORIZON' });
    const t0 = Date.now();
    reader.start(async (rs) => { got.push(...rs.map((r) => r.dynamodb!.SequenceNumber!)); });
    await wait(() => got.length === 3);
    expect(got).toEqual(['1', '2', '3']);
    expect(Date.now() - t0).toBeLessThan(400); // no 500 ms sleep between the two non-empty polls
    expect(calls.filter((c) => c === 'GetRecordsCommand').length).toBeGreaterThanOrEqual(2);
    await reader.stop();
  });

  it('(b) reads a child shard after its closed parent', async () => {
    let described = 0;
    const served = new Set<string>();
    const { streams } = fake((name, input) => {
      if (name === 'DescribeStreamCommand') {
        described++;
        return { StreamDescription: { Shards: described === 1 ? [{ ShardId: 's1' }] : [{ ShardId: 's1' }, { ShardId: 's2', ParentShardId: 's1' }] } };
      }
      if (name === 'GetShardIteratorCommand') return { ShardIterator: `it-${input['ShardId']}` };
      const id = String(input['ShardIterator']).replace('it-', '');
      if (served.has(id)) return { Records: [], NextShardIterator: `it-${id}` };
      served.add(id);
      return id === 's1' ? { Records: [rec('1'), rec('2')] } : { Records: [rec('3')], NextShardIterator: 'it-s2' };
    });
    const got: string[] = [];
    const reader = new StreamReader({ streams, streamArn: ARN, pollIntervalMs: 10, startAt: 'TRIM_HORIZON', discoverEveryMs: 20 });
    reader.start(async (rs) => { got.push(...rs.map((r) => r.dynamodb!.SequenceNumber!)); });
    await wait(() => got.length === 3);
    expect(got).toEqual(['1', '2', '3']);
    await reader.stop();
  });

  it('(c) idles at about pollIntervalMs', async () => {
    const { streams, calls } = fake((name) => {
      if (name === 'DescribeStreamCommand') return { StreamDescription: { Shards: [{ ShardId: 's1' }] } };
      if (name === 'GetShardIteratorCommand') return { ShardIterator: 'it' };
      return { Records: [], NextShardIterator: 'it' };
    });
    const reader = new StreamReader({ streams, streamArn: ARN, pollIntervalMs: 20, startAt: 'LATEST' });
    reader.start(async () => {});
    await new Promise((r) => setTimeout(r, 100));
    await reader.stop();
    expect(calls.filter((c) => c === 'GetRecordsCommand').length).toBeLessThanOrEqual(6);
  });

  it('(d) stop resolves even while sleeping', async () => {
    const { streams } = fake((name) => {
      if (name === 'DescribeStreamCommand') return { StreamDescription: { Shards: [{ ShardId: 's1' }] } };
      if (name === 'GetShardIteratorCommand') return { ShardIterator: 'it' };
      return { Records: [], NextShardIterator: 'it' };
    });
    const reader = new StreamReader({ streams, streamArn: ARN, pollIntervalMs: 60_000, startAt: 'LATEST' });
    reader.start(async () => {});
    await new Promise((r) => setTimeout(r, 30));
    await expect(reader.stop()).resolves.toBeUndefined();
  });

  it('converts SDK records to Lambda shape', () => {
    const l = toLambdaRecord(rec('7') as never, ARN);
    expect(l.eventSource).toBe('aws:dynamodb');
    expect(l.eventSourceARN).toBe(ARN);
    expect(l.dynamodb?.ApproximateCreationDateTime).toBe(1_700_000_000);
  });
});
