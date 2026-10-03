import { existsSync, readFileSync } from 'node:fs';
import { buildSchema, isInputObjectType, isObjectType, type GraphQLSchema } from 'graphql';
import { describe, expect, it } from 'vitest';
import { LOCAL_PRELUDE, loadSdl, RESOLVERS, resolverPath, schemaPath } from '../src/index.js';

const INT_FIELDS = /^(priceMinor|beforeMinor|afterMinor|inputsVersion|ruleSetVersion)$/;

function allFields(schema: GraphQLSchema): Array<{ type: string; field: string; named: string }> {
  const out: Array<{ type: string; field: string; named: string }> = [];
  for (const t of Object.values(schema.getTypeMap())) {
    if (t.name.startsWith('__')) continue;
    if (isObjectType(t) || isInputObjectType(t)) {
      for (const f of Object.values(t.getFields())) out.push({ type: t.name, field: f.name, named: String(f.type).replace(/[![\]]/g, '') });
    }
  }
  return out;
}

describe('schema', () => {
  it('builds with the local prelude', () => {
    expect(() => buildSchema(LOCAL_PRELUDE + loadSdl())).not.toThrow();
  });
  it('uses Int for every money and version field', () => {
    const schema = buildSchema(LOCAL_PRELUDE + loadSdl());
    const money = allFields(schema).filter((f) => INT_FIELDS.test(f.field));
    expect(money.length).toBeGreaterThan(5);
    for (const f of money) expect(f.named, `${f.type}.${f.field}`).toBe('Int');
  });
  it('restricts publishPrice to IAM', () => {
    const sdl = readFileSync(schemaPath, 'utf8');
    expect(sdl).toMatch(/publishPrice\(input: PriceInput!\): Price @aws_iam\s*$/m);
    const line = sdl.split('\n').find((l) => l.includes('publishPrice('));
    expect(line).not.toContain('@aws_cognito_user_pools');
  });
  it('lists exactly the five resolver files, all present', () => {
    expect(RESOLVERS.map((r) => `${r.typeName}.${r.fieldName}`).sort()).toEqual(
      ['Mutation.publishPrice', 'Mutation.putInput', 'Query.decision', 'Query.price', 'Query.pricesByCategory'],
    );
    for (const r of RESOLVERS) expect(existsSync(resolverPath(r.typeName, r.fieldName))).toBe(true);
  });
});
