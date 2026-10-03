import { Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';

const template = Template.fromStack(buildApp({ nag: false }).stack);
type Res = { Properties: Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any

describe('AppSync API', () => {
  it('uses Cognito by default and IAM additionally', () => {
    const api = Object.values(template.findResources('AWS::AppSync::GraphQLApi'))[0] as Res;
    expect(api.Properties['AuthenticationType']).toBe('AMAZON_COGNITO_USER_POOLS');
    expect(api.Properties['AdditionalAuthenticationProviders']).toEqual([{ AuthenticationType: 'AWS_IAM' }]);
  });
  it('ships the schema with publishPrice restricted to IAM', () => {
    const schema = Object.values(template.findResources('AWS::AppSync::GraphQLSchema'))[0] as Res;
    expect(schema.Properties['Definition']).toContain('publishPrice(input: PriceInput!): Price @aws_iam');
  });
  it('defines five APPSYNC_JS resolvers, publishPrice on the NONE data source', () => {
    const resolvers = Object.values(template.findResources('AWS::AppSync::Resolver')) as Res[];
    expect(resolvers).toHaveLength(5);
    for (const r of resolvers) expect(r.Properties['Runtime']).toEqual({ Name: 'APPSYNC_JS', RuntimeVersion: '1.0.0' });
    const publish = resolvers.find((r) => r.Properties['FieldName'] === 'publishPrice')!;
    expect(publish.Properties['DataSourceName']).toBeDefined();
    const none = (Object.values(template.findResources('AWS::AppSync::DataSource')) as Res[]).find((d) => d.Properties['Type'] === 'NONE')!;
    expect(publish.Properties['DataSourceName']).toBe(none.Properties['Name']);
  });
  it('has two nodejs24.x arm64 functions', () => {
    const fns = (Object.values(template.findResources('AWS::Lambda::Function')) as Res[]).filter((f) => f.Properties['Handler'] === 'index.handler' && (f.Properties['Environment']?.Variables?.TABLE_NAME || f.Properties['Environment']?.Variables?.APPSYNC_URL));
    expect(fns).toHaveLength(2);
    for (const f of fns) {
      expect(f.Properties['Runtime']).toBe('nodejs24.x');
      expect(f.Properties['Architectures']).toEqual(['arm64']);
    }
  });
});
