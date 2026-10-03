import { build } from 'esbuild';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const entries = [
  ['recompute', 'src/lambda/recompute.ts'],
  ['publisher', 'src/lambda/publisher.ts'],
];

// The Node 24 Lambda runtime provides these AWS SDK v3 packages. credential-provider-node,
// signature-v4 and sha256-js are bundled so the publisher does not depend on runtime internals.
const external = ['@aws-sdk/client-*', '@aws-sdk/lib-dynamodb', '@aws-sdk/util-dynamodb'];

for (const [name, entry] of entries) {
  const outfile = join(root, 'dist', name, 'index.mjs');
  const result = await build({
    entryPoints: [join(root, entry)],
    outfile,
    bundle: true,
    platform: 'node',
    target: 'node24',
    format: 'esm',
    external,
    banner: { js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);" },
    minify: false,
    sourcemap: false,
    metafile: true,
    logLevel: 'warning',
  });
  const bytes = Object.values(result.metafile.outputs).reduce((n, o) => n + o.bytes, 0);
  console.log(`bundled ${name}: ${bytes} bytes`);
}
