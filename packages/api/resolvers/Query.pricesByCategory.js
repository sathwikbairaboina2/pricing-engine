import { util } from '@aws-appsync/utils';

export function request(ctx) {
  const limit = ctx.args.limit ?? 50;
  if (limit < 1 || limit > 100) {
    util.error('limit must be 1..100', 'BadRequest');
  }
  return {
    operation: 'Query',
    index: 'GSI1',
    query: {
      expression: 'GSI1PK = :pk',
      expressionValues: util.dynamodb.toMapValues({ ':pk': 'CATEGORY#' + ctx.args.category }),
    },
    limit,
  };
}

export function response(ctx) {
  return ctx.result.items.map((r) => ({
    sku: r.sku,
    priceMinor: r.priceMinor,
    currency: r.currency,
    inputsVersion: r.inputsVersion,
    ruleSetVersion: r.ruleSetVersion,
    computedAt: r.computedAt,
  }));
}
