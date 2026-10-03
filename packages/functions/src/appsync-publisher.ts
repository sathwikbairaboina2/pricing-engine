import { Sha256 } from '@aws-crypto/sha256-js';
import { defaultProvider } from '@aws-sdk/credential-provider-node';
import { SignatureV4 } from '@smithy/signature-v4';
import { postGraphql, publishBody, type PriceMessage, type PricePublisher } from './publisher.js';

export interface AwsCredentialIdentity { accessKeyId: string; secretAccessKey: string; sessionToken?: string }
export type AwsCredentialIdentityProvider = () => Promise<AwsCredentialIdentity>;

export class AppSyncPublisher implements PricePublisher {
  private readonly url: string;
  private readonly region: string;
  private readonly credentials: AwsCredentialIdentity | AwsCredentialIdentityProvider | undefined;
  private readonly doFetch: typeof fetch;

  constructor(opts: { url: string; region: string; credentials?: AwsCredentialIdentity | AwsCredentialIdentityProvider; fetch?: typeof fetch }) {
    this.url = opts.url;
    this.region = opts.region;
    this.credentials = opts.credentials;
    this.doFetch = opts.fetch ?? fetch;
  }

  async publish(msg: PriceMessage): Promise<void> {
    const u = new URL(this.url);
    const body = publishBody(msg);
    const signer = new SignatureV4({
      service: 'appsync',
      region: this.region,
      credentials: this.credentials ?? defaultProvider(),
      sha256: Sha256,
    });
    const signed = await signer.sign({
      method: 'POST',
      protocol: u.protocol,
      hostname: u.hostname,
      path: u.pathname,
      headers: { host: u.hostname, 'content-type': 'application/json' },
      body,
    });
    await postGraphql(this.doFetch, this.url, signed.headers as Record<string, string>, body);
  }
}
