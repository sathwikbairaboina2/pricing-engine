import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';

describe('cdk-nag AwsSolutions', () => {
  it('synthesizes with no unacknowledged findings', () => {
    const outdir = mkdtempSync(join(tmpdir(), 'pricing-nag-'));
    expect(() => buildApp({ nag: true, outdir }).app.synth()).not.toThrow();
  });
});
