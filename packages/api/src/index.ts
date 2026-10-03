import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const schemaPath: string = fileURLToPath(new URL('../schema.graphql', import.meta.url));

export const RESOLVERS: ReadonlyArray<{ typeName: 'Query' | 'Mutation'; fieldName: string; file: string; dataSource: 'TABLE' | 'NONE' }> = [
  { typeName: 'Query', fieldName: 'price', file: 'Query.price.js', dataSource: 'TABLE' },
  { typeName: 'Query', fieldName: 'decision', file: 'Query.decision.js', dataSource: 'TABLE' },
  { typeName: 'Query', fieldName: 'pricesByCategory', file: 'Query.pricesByCategory.js', dataSource: 'TABLE' },
  { typeName: 'Mutation', fieldName: 'putInput', file: 'Mutation.putInput.js', dataSource: 'TABLE' },
  { typeName: 'Mutation', fieldName: 'publishPrice', file: 'Mutation.publishPrice.js', dataSource: 'NONE' },
];

export function resolverPath(typeName: string, fieldName: string): string {
  return fileURLToPath(new URL(`../resolvers/${typeName}.${fieldName}.js`, import.meta.url));
}

/** Scalar and directive declarations AppSync provides implicitly. */
export const LOCAL_PRELUDE = `scalar AWSDateTime
directive @aws_iam on FIELD_DEFINITION | OBJECT
directive @aws_cognito_user_pools(cognito_groups: [String]) on FIELD_DEFINITION | OBJECT
directive @aws_subscribe(mutations: [String!]!) on FIELD_DEFINITION
`;

export function loadSdl(): string {
  return readFileSync(schemaPath, 'utf8');
}
