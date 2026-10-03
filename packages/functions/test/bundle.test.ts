import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

const pkgDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const bundle = (name: string) => join(pkgDir, 'dist', name, 'index.mjs');

describe('lambda bundles', () => {
  beforeAll(() => {
    execFileSync(process.execPath, ['scripts/bundle.mjs'], { cwd: pkgDir, stdio: 'pipe' });
  }, 60000);

  it.each(['recompute', 'publisher'])('%s exists, is under 1 MB and inlines the core', (name) => {
    expect(existsSync(bundle(name))).toBe(true);
    expect(statSync(bundle(name)).size).toBeLessThan(1_000_000);
    expect(readFileSync(bundle(name), 'utf8')).not.toMatch(/from ['"]pricing-rules-core['"]/);
  });
  it('recompute exports a handler', async () => {
    process.env['TABLE_NAME'] = 'T';
    const mod = await import(pathToFileURL(bundle('recompute')).href);
    expect(typeof mod.handler).toBe('function');
  });
  it('publisher exports a handler', async () => {
    process.env['APPSYNC_URL'] = 'https://example.appsync-api.eu-west-1.amazonaws.com/graphql';
    process.env['AWS_REGION'] = 'eu-west-1';
    const mod = await import(pathToFileURL(bundle('publisher')).href);
    expect(typeof mod.handler).toBe('function');
  });
});
