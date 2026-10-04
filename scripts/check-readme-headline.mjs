import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const latest = JSON.parse(readFileSync(join(root, 'bench', 'results', 'latest.json'), 'utf8'));
const readme = readFileSync(join(root, 'README.md'), 'utf8').split(/\r?\n/).slice(0, 5);

const p99 = `p99 ${Math.round(latest.latencyMs.p99)} ms`;
const samples = latest.samples.toLocaleString('en-US');
const rate = `${latest.rate} updates/s`;
const lost = `${latest.lost} lost`;
const date = String(latest.at).slice(0, 10);
const ok = readme.some((line) => [p99, samples, rate, lost, date].every((part) => line.includes(part)));

if (!ok) {
  console.error(`headline MISMATCH: one of the first 5 README lines must contain "${p99}", "${samples}", "${rate}", "${lost}" and "${date}" (from bench/results/latest.json)`);
  process.exit(1);
}
console.log(`headline OK: ${p99}, ${samples} samples, ${rate}, ${lost}, ${date}`);
