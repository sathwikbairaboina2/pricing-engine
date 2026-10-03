import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const win = process.platform === 'win32';
const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { cwd: pkgDir, encoding: 'utf8', shell: win && cmd === 'pnpm', stdio: ['ignore', 'pipe', 'inherit'], ...opts });

function fail(msg) {
  console.error(`pack-check FAILED: ${msg}`);
  process.exit(1);
}

const tmp = mkdtempSync(join(tmpdir(), 'pack-check-'));
try {
  run('pnpm', ['build']);
  run('pnpm', ['pack', '--pack-destination', tmp]);
  const tgz = join(tmp, 'pricing-rules-core-0.1.0.tgz');
  const files = run('tar', ['-tzf', 'pricing-rules-core-0.1.0.tgz'], { cwd: tmp }).split(/\r?\n/).filter(Boolean);
  for (const need of ['package/dist/index.js', 'package/dist/index.d.ts', 'package/README.md', 'package/LICENSE']) {
    if (!files.includes(need)) fail(`missing ${need}`);
  }
  const leaked = files.filter((f) => f.startsWith('package/src/') || f.startsWith('package/test/'));
  if (leaked.length > 0) fail(`unexpected entries: ${leaked.join(', ')}`);
  run('tar', ['-xzf', 'pricing-rules-core-0.1.0.tgz', 'package/package.json'], { cwd: tmp });
  const manifest = JSON.parse(readFileSync(join(tmp, 'package', 'package.json'), 'utf8'));
  if (manifest.exports?.['.']?.default !== './dist/index.js') fail('publishConfig.exports was not applied to the packed manifest');
  console.log(`pack-check OK: ${files.length} files, ${statSync(tgz).size} bytes`);
} catch (e) {
  fail(e instanceof Error ? e.message : String(e));
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
