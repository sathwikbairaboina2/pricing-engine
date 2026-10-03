import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const latest = JSON.parse(readFileSync(join(root, 'bench', 'results', 'latest.json'), 'utf8'));
const readme = readFileSync(join(root, 'README.md'), 'utf8').split(/\r?\n/).slice(0, 5);

const p99 = `p99 ${Math.round(latest.latencyMs.p99)} ms`;
const samples = latest.samples.toLocaleString('en-US');
const ok = readme.some((line) => line.includes(p99) && line.includes(samples));

if (!ok) {
  console.error(`headline MISMATCH: one of the first 5 README lines must contain "${p99}" and "${samples}" (from bench/results/latest.json)`);
  process.exit(1);
}
console.log(`headline OK: ${p99}, ${samples} samples`);
