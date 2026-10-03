import { describe, expect, it } from 'vitest';
import { AppSyncPublisher } from '../src/appsync-publisher.js';
import { PUBLISH_PRICE_MUTATION, PublishError, type PriceMessage } from '../src/publisher.js';
import { ShimPublisher } from '../src/shim-publisher.js';

const msg: PriceMessage = { sku: 'A1', priceMinor: 1299, currency: 'EUR', inputsVersion: 3, ruleSetVersion: 1, computedAt: '2026-10-04T00:00:00.000Z' };
const URL_ = 'https://example.appsync-api.eu-west-1.amazonaws.com/graphql';

function fakeFetch(response: unknown, ok = true) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return { ok, status: ok ? 200 : 401, json: async () => response } as Response;
  }) as unknown as typeof fetch;
  return { f, calls };
}

describe('AppSyncPublisher', () => {
  const credentials = { accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY' };

  it('signs the request with SigV4 for appsync', async () => {
    const { f, calls } = fakeFetch({ data: { publishPrice: msg } });
    await new AppSyncPublisher({ url: URL_, region: 'eu-west-1', credentials, fetch: f }).publish(msg);
    const init = calls[0]!.init;
    const h = init.headers as Record<string, string>;
    const auth = h['authorization'] ?? h['Authorization'] ?? '';
    expect(auth.startsWith('AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/')).toBe(true);
    expect(auth).toContain('/eu-west-1/appsync/aws4_request');
    expect(h['x-amz-date']).toBeDefined();
    expect(h['host']).toBe('example.appsync-api.eu-west-1.amazonaws.com');
    const body = JSON.parse(String(init.body));
    expect(body.query).toBe(PUBLISH_PRICE_MUTATION);
    expect(body.variables.input.sku).toBe('A1');
  });
  it('rejects with PublishError on GraphQL errors', async () => {
    const { f } = fakeFetch({ errors: [{ message: 'Unauthorized' }] });
    const p = new AppSyncPublisher({ url: URL_, region: 'eu-west-1', credentials, fetch: f }).publish(msg);
    await expect(p).rejects.toBeInstanceOf(PublishError);
    await expect(p).rejects.toThrow(/Unauthorized/);
  });
});

describe('ShimPublisher', () => {
  it('sends the publish token header', async () => {
    const { f, calls } = fakeFetch({ data: {} });
    await new ShimPublisher({ url: 'http://127.0.0.1:5361/graphql', token: 'local-dev-only', fetch: f }).publish(msg);
    expect((calls[0]!.init.headers as Record<string, string>)['x-pricing-publish-token']).toBe('local-dev-only');
  });
});
