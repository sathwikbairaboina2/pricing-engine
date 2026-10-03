import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['test/**/*.int.test.ts'],
    env: { PRICING_INTEGRATION: '1' },
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
});
