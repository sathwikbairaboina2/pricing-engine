import { util } from '@aws-appsync/utils';

export function request(ctx) {
  const { sku, source, value, seq } = ctx.args;
  if (!util.matches('^[A-Za-z0-9-]{1,64}$', sku)) {
    util.error('invalid sku', 'BadRequest');
  }
  if (seq < 1) {
    util.error('seq must be >= 1', 'BadRequest');
  }
  return {
    operation: 'PutItem',
    key: util.dynamodb.toMapValues({ PK: 'SKU#' + sku, SK: 'INPUT#' + source }),
    attributeValues: util.dynamodb.toMapValues({ value, seq, observedAt: util.time.nowISO8601() }),
    condition: {
      expression: 'attribute_not_exists(SK) OR #seq < :seq',
      expressionNames: { '#seq': 'seq' },
      expressionValues: util.dynamodb.toMapValues({ ':seq': seq }),
    },
  };
}

export function response(ctx) {
  if (ctx.error) {
    if (ctx.error.type === 'DynamoDB:ConditionalCheckFailedException') {
      return false;
    }
    util.error(ctx.error.message, ctx.error.type);
  }
  return true;
}
