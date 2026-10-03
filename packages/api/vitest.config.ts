import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@aws-appsync/utils': fileURLToPath(new URL('./src/appsync-utils-shim.js', import.meta.url)) } },
  test: { include: ['test/**/*.test.ts'], testTimeout: 60000 },
});
