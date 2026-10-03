import tseslint from 'typescript-eslint';
import appsync from '@aws-appsync/eslint-plugin';

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', '**/cdk.out/**', '**/coverage/**', 'bench/results/**'] },
  { files: ['**/*.ts', '**/*.tsx'], extends: [tseslint.configs.recommended] },
  {
    files: ['packages/core/src/**/*.ts'],
    rules: {
      'no-restricted-globals': ['error',
        { name: 'Date', message: 'core must be pure: inject time as a parameter' },
        { name: 'parseFloat', message: 'core uses integer minor units only' }],
      'no-restricted-properties': ['error',
        { object: 'Math', property: 'random', message: 'core must be deterministic' },
        { object: 'Number', property: 'parseFloat', message: 'core uses integer minor units only' }],
    },
  },
  { ...appsync.configs.base, files: ['packages/api/resolvers/**/*.js'] },
);
