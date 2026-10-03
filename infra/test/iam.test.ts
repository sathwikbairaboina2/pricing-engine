import { Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';

const template = Template.fromStack(buildApp({ nag: false }).stack);
type Statement = { Effect: string; Action: string | string[]; Resource?: unknown };
type Res = { Properties: Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any

const policies = Object.entries(template.findResources('AWS::IAM::Policy')) as Array<[string, Res]>;
const statementsOf = (p: Res): Statement[] => p.Properties['PolicyDocument'].Statement;
const actions = (s: Statement): string[] => (Array.isArray(s.Action) ? s.Action : [s.Action]);

describe('IAM', () => {
  it('has no wildcard action in any policy or inline role policy', () => {
    const all: Statement[] = policies.flatMap(([, p]) => statementsOf(p));
    for (const r of Object.values(template.findResources('AWS::IAM::Role')) as Res[]) {
      for (const inline of (r.Properties['Policies'] ?? []) as Array<{ PolicyDocument: { Statement: Statement[] } }>) all.push(...inline.PolicyDocument.Statement);
    }
    expect(all.length).toBeGreaterThan(0);
    for (const s of all) for (const a of actions(s)) expect(a, a).not.toContain('*');
  });
  it('lets the publisher call only Mutation.publishPrice', () => {
    const found = policies.filter(([name]) => name.includes('Publisher'));
    const stmts = found.flatMap(([, p]) => statementsOf(p)).filter((s) => actions(s).includes('appsync:GraphQL'));
    expect(stmts.length).toBeGreaterThan(0);
    for (const s of stmts) expect(JSON.stringify(s.Resource)).toMatch(/\/types\/Mutation\/fields\/publishPrice/);
  });
  it('does not let recompute scan or delete', () => {
    const found = policies.filter(([name]) => name.includes('Recompute'));
    const acts = found.flatMap(([, p]) => statementsOf(p)).flatMap(actions);
    expect(acts).toContain('dynamodb:PutItem');
    expect(acts).not.toContain('dynamodb:Scan');
    expect(acts).not.toContain('dynamodb:DeleteItem');
  });
});
