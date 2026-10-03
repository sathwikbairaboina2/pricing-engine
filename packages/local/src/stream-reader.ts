import {
  DescribeStreamCommand,
  GetRecordsCommand,
  GetShardIteratorCommand,
  type DynamoDBStreamsClient,
  type _Record as StreamRecord,
} from '@aws-sdk/client-dynamodb-streams';
import type { DynamoDBRecord } from 'aws-lambda';

export interface StreamReaderOptions {
  streams: DynamoDBStreamsClient;
  streamArn: string;
  pollIntervalMs: number;
  startAt: 'TRIM_HORIZON' | 'LATEST';
  discoverEveryMs?: number;
}

export function toLambdaRecord(r: StreamRecord, streamArn: string): DynamoDBRecord {
  const d = r.dynamodb ?? {};
  return {
    eventID: r.eventID,
    eventName: r.eventName as DynamoDBRecord['eventName'],
    eventVersion: r.eventVersion,
    eventSource: 'aws:dynamodb',
    awsRegion: r.awsRegion ?? 'us-east-1',
    eventSourceARN: streamArn,
    dynamodb: {
      ApproximateCreationDateTime: d.ApproximateCreationDateTime ? Math.floor(d.ApproximateCreationDateTime.getTime() / 1000) : undefined,
      Keys: d.Keys as never,
      NewImage: d.NewImage as never,
      OldImage: d.OldImage as never,
      SequenceNumber: d.SequenceNumber,
      SizeBytes: d.SizeBytes,
      StreamViewType: d.StreamViewType as never,
    },
  };
}

interface ShardState { id: string; iterator: string | undefined; lastSeq?: string }

const sleepFor = (ms: number, signal: { wake?: () => void }) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    signal.wake = () => { clearTimeout(t); resolve(); };
  });

export class StreamReader {
  private readonly opts: Required<StreamReaderOptions>;
  private running = false;
  private loop: Promise<void> | undefined;
  private readonly active = new Map<string, ShardState>();
  private readonly finished = new Set<string>();
  private readonly known = new Set<string>();
  private lastDiscovery = 0;
  private firstDiscovery = true;
  private readonly sleeper: { wake?: () => void } = {};

  constructor(opts: StreamReaderOptions) {
    this.opts = { discoverEveryMs: 5000, ...opts };
  }

  start(onRecords: (records: DynamoDBRecord[]) => Promise<void>): void {
    if (this.running) return;
    this.running = true;
    this.loop = this.run(onRecords);
  }

  async stop(): Promise<void> {
    this.running = false;
    this.sleeper.wake?.();
    await this.loop;
  }

  private async iteratorFor(shardId: string, type: 'TRIM_HORIZON' | 'LATEST' | 'AFTER_SEQUENCE_NUMBER', seq?: string): Promise<string | undefined> {
    const res = await this.opts.streams.send(new GetShardIteratorCommand({
      StreamArn: this.opts.streamArn,
      ShardId: shardId,
      ShardIteratorType: type,
      ...(seq ? { SequenceNumber: seq } : {}),
    }));
    return res.ShardIterator;
  }

  private async discover(): Promise<void> {
    this.lastDiscovery = Date.now();
    const shards: Array<{ ShardId?: string; ParentShardId?: string }> = [];
    let start: string | undefined;
    do {
      const res = await this.opts.streams.send(new DescribeStreamCommand({
        StreamArn: this.opts.streamArn,
        ...(start ? { ExclusiveStartShardId: start } : {}),
      }));
      shards.push(...(res.StreamDescription?.Shards ?? []));
      start = res.StreamDescription?.LastEvaluatedShardId;
    } while (start);

    const initial = this.firstDiscovery;
    for (const s of shards) {
      const id = s.ShardId;
      if (!id || this.known.has(id)) continue;
      if (s.ParentShardId && this.active.has(s.ParentShardId)) continue; // read the parent to its end first
      this.known.add(id);
      const type = initial ? this.opts.startAt : 'TRIM_HORIZON';
      this.active.set(id, { id, iterator: await this.iteratorFor(id, type) });
    }
    this.firstDiscovery = false;
  }

  private async pollShard(shard: ShardState, onRecords: (r: DynamoDBRecord[]) => Promise<void>): Promise<number> {
    if (!shard.iterator) {
      this.active.delete(shard.id);
      this.finished.add(shard.id);
      return 0;
    }
    let res;
    try {
      res = await this.opts.streams.send(new GetRecordsCommand({ ShardIterator: shard.iterator, Limit: 1000 }));
    } catch (e) {
      if ((e as Error).name === 'ExpiredIteratorException' || (e as Error).name === 'TrimmedDataAccessException') {
        shard.iterator = shard.lastSeq
          ? await this.iteratorFor(shard.id, 'AFTER_SEQUENCE_NUMBER', shard.lastSeq)
          : await this.iteratorFor(shard.id, 'TRIM_HORIZON');
        return 0;
      }
      throw e;
    }
    const raw = res.Records ?? [];
    shard.iterator = res.NextShardIterator ?? undefined;
    if (raw.length > 0) {
      shard.lastSeq = raw[raw.length - 1]?.dynamodb?.SequenceNumber ?? shard.lastSeq;
      await onRecords(raw.map((r) => toLambdaRecord(r, this.opts.streamArn)));
    }
    if (!shard.iterator) {
      this.active.delete(shard.id);
      this.finished.add(shard.id);
      this.lastDiscovery = 0; // a closed shard means its children may be readable now
    }
    return raw.length;
  }

  private async run(onRecords: (records: DynamoDBRecord[]) => Promise<void>): Promise<void> {
    while (this.running) {
      let got = 0;
      try {
        if (this.active.size === 0 || Date.now() - this.lastDiscovery >= this.opts.discoverEveryMs) await this.discover();
        for (const shard of [...this.active.values()]) {
          if (!this.running) break;
          got += await this.pollShard(shard, onRecords);
        }
      } catch (e) {
        console.error(JSON.stringify({ msg: 'stream-reader error', error: e instanceof Error ? e.message : String(e) }));
        got = 0;
      }
      if (!this.running) break;
      if (got === 0 || this.active.size === 0) await sleepFor(this.opts.pollIntervalMs, this.sleeper);
    }
  }
}
