import { join } from 'node:path';
import { DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import {
  createPublisherHandler,
  createRecomputeHandler,
  DynamoDBStore,
  PUBLISHER_FILTERS,
  RECOMPUTE_FILTERS,
  type DynamoClients,
  type PricePublisher,
} from '@pricing-engine/functions';
import type { DynamoDBRecord } from 'aws-lambda';
import { deliver, jsonlDeadLetter } from './deliver.js';
import { matchesAny } from './pattern.js';
import { StreamReader } from './stream-reader.js';

export interface RunnerOptions {
  clients: DynamoClients;
  tableName: string;
  publisher: PricePublisher;
  pollIntervalMs: number;
  dlqDir: string;
  startAt?: 'TRIM_HORIZON' | 'LATEST';
  now?: () => number;
  log?: (e: Record<string, unknown>) => void;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitForStream(clients: DynamoClients, tableName: string): Promise<string> {
  const deadline = Date.now() + 60_000;
  for (;;) {
    try {
      const { Table } = await clients.ddb.send(new DescribeTableCommand({ TableName: tableName }));
      if (Table?.LatestStreamArn && Table.TableStatus === 'ACTIVE') return Table.LatestStreamArn;
    } catch {
      // table or DynamoDB Local not up yet; keep waiting so compose services can start in any order
    }
    if (Date.now() > deadline) throw new Error(`no stream for table ${tableName} after 60s (is DynamoDB Local up and the table created?)`);
    await sleep(1000);
  }
}

export async function startRunner(opts: RunnerOptions): Promise<{ stop: () => Promise<void> }> {
  const log = opts.log ?? ((e: Record<string, unknown>) => console.log(JSON.stringify(e)));
  const streamArn = await waitForStream(opts.clients, opts.tableName);
  const recompute = createRecomputeHandler({
    store: new DynamoDBStore({ doc: opts.clients.doc, tableName: opts.tableName }),
    now: opts.now ?? (() => Date.now()),
    log,
  });
  const publish = createPublisherHandler({ publisher: opts.publisher, log });
  const recomputeDlq = jsonlDeadLetter(join(opts.dlqDir, 'recompute.jsonl'));
  const publisherDlq = jsonlDeadLetter(join(opts.dlqDir, 'publisher.jsonl'));

  const reader = new StreamReader({
    streams: opts.clients.streams,
    streamArn,
    pollIntervalMs: opts.pollIntervalMs,
    startAt: opts.startAt ?? 'TRIM_HORIZON',
  });
  reader.start(async (records: DynamoDBRecord[]) => {
    await deliver(records.filter((r) => matchesAny(r, RECOMPUTE_FILTERS)), recompute, { maxRetries: 3, bisectOnError: true, onDeadLetter: recomputeDlq });
    await deliver(records.filter((r) => matchesAny(r, PUBLISHER_FILTERS)), publish, { maxRetries: 3, bisectOnError: true, onDeadLetter: publisherDlq });
  });
  log({ msg: `runner started table=${opts.tableName} stream=${streamArn} poll=${opts.pollIntervalMs}ms` });
  return { stop: () => reader.stop() };
}
