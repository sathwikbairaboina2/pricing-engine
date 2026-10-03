import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { DynamoDBBatchResponse, DynamoDBRecord, DynamoDBStreamEvent } from 'aws-lambda';

export interface DeliveryOptions {
  maxRetries: number;
  bisectOnError: boolean;
  onDeadLetter: (records: DynamoDBRecord[], reason: string) => Promise<void>;
}
export type StreamHandler = (event: DynamoDBStreamEvent) => Promise<DynamoDBBatchResponse | void>;

/** Mirrors the Lambda event source mapping: partial-batch retry, bisect on a thrown error, park after maxRetries. */
export async function deliver(records: DynamoDBRecord[], handler: StreamHandler, opts: DeliveryOptions): Promise<{ invocations: number; deadLettered: number }> {
  let invocations = 0;
  let deadLettered = 0;

  const park = async (rs: DynamoDBRecord[], reason: string) => {
    deadLettered += rs.length;
    await opts.onDeadLetter(rs, reason);
  };

  const deliverRange = async (rs: DynamoDBRecord[], attempt: number): Promise<void> => {
    if (rs.length === 0) return;
    invocations++;
    let res: DynamoDBBatchResponse | void;
    try {
      res = await handler({ Records: rs });
    } catch (e) {
      if (opts.bisectOnError && rs.length > 1) {
        const mid = Math.ceil(rs.length / 2);
        await deliverRange(rs.slice(0, mid), attempt);
        await deliverRange(rs.slice(mid), attempt);
        return;
      }
      if (attempt >= opts.maxRetries) {
        await park(rs, `handler error: ${e instanceof Error ? e.message : String(e)}`);
        return;
      }
      return deliverRange(rs, attempt + 1);
    }
    const failures = res?.batchItemFailures ?? [];
    if (failures.length === 0) return;
    const ids = new Set(failures.map((f) => f.itemIdentifier));
    let idx = rs.findIndex((r) => r.dynamodb?.SequenceNumber !== undefined && ids.has(r.dynamodb.SequenceNumber));
    if (idx < 0) idx = 0;
    if (attempt >= opts.maxRetries) {
      await park(rs.slice(idx), 'batchItemFailures after retries');
      return;
    }
    return deliverRange(rs.slice(idx), attempt + 1);
  };

  await deliverRange(records, 0);
  return { invocations, deadLettered };
}

export function jsonlDeadLetter(filePath: string): DeliveryOptions['onDeadLetter'] {
  return async (records, reason) => {
    await mkdir(dirname(filePath), { recursive: true });
    const at = new Date().toISOString();
    await appendFile(filePath, records.map((record) => JSON.stringify({ at, reason, record })).join('\n') + '\n');
  };
}
