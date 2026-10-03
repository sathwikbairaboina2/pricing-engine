import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['test/**/*.int.test.ts'],
    env: { PRICING_INTEGRATION: '1' },
    testTimeout: 60000,
    hookTimeout: 60000,
    fileParallelism: false,
  },
});
