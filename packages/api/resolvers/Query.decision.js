import { util } from '@aws-appsync/utils';

export function request(ctx) {
  if (!util.matches('^[A-Za-z0-9-]{1,64}$', ctx.args.sku)) {
    util.error('invalid sku', 'BadRequest');
  }
  return {
    operation: 'GetItem',
    key: util.dynamodb.toMapValues({ PK: 'SKU#' + ctx.args.sku, SK: 'PRICE#CURRENT' }),
    consistentRead: true,
  };
}

export function response(ctx) {
  const r = ctx.result;
  if (!r) {
    return null;
  }
  return {
    price: {
      sku: r.sku,
      priceMinor: r.priceMinor,
      currency: r.currency,
      inputsVersion: r.inputsVersion,
      ruleSetVersion: r.ruleSetVersion,
      computedAt: r.computedAt,
    },
    trace: r.decisionTrace ?? [],
  };
}
