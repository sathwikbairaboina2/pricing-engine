import { postGraphql, publishBody, type PriceMessage, type PricePublisher } from './publisher.js';

export class ShimPublisher implements PricePublisher {
  private readonly url: string;
  private readonly token: string;
  private readonly doFetch: typeof fetch;

  constructor(opts: { url: string; token: string; fetch?: typeof fetch }) {
    this.url = opts.url;
    this.token = opts.token;
    this.doFetch = opts.fetch ?? fetch;
  }

  async publish(msg: PriceMessage): Promise<void> {
    await postGraphql(this.doFetch, this.url, { 'content-type': 'application/json', 'x-pricing-publish-token': this.token }, publishBody(msg));
  }
}
