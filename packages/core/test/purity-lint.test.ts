import { ESLint } from 'eslint';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const code = 'export const a = Date.now();\nexport const b = Math.random();\nexport const c = parseFloat("1.5");\n';

async function ruleIds(filePath: string): Promise<string[]> {
  const eslint = new ESLint({ cwd: repoRoot });
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).map((m) => m.ruleId ?? 'fatal');
}

describe('core purity lint rule', () => {
  it('rejects Date, Math.random and parseFloat inside packages/core/src', async () => {
    const ids = await ruleIds(`${repoRoot}packages/core/src/__purity_fixture__.ts`);
    expect(ids.filter((i) => i === 'no-restricted-globals')).toHaveLength(2);
    expect(ids.filter((i) => i === 'no-restricted-properties')).toHaveLength(1);
  });
  it('does not apply outside core', async () => {
    const ids = await ruleIds(`${repoRoot}packages/functions/src/__purity_fixture__.ts`);
    expect(ids).not.toContain('no-restricted-globals');
    expect(ids).not.toContain('no-restricted-properties');
  });
});
