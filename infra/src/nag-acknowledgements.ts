import { Validations } from 'aws-cdk-lib';
import type { PricingStack } from './pricing-stack.js';

const RULE = 'AwsSolutions::AwsSolutions-';
const LAMBDA_BASIC = `${RULE}IAM4[Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole]`;
const APPSYNC_LOGS = `${RULE}IAM4[Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSAppSyncPushToCloudWatchLogs]`;

/**
 * Every acknowledgement is scoped to the narrowest construct that triggers it.
 * Nothing here covers the inline policies written for the recompute and publisher functions:
 * those are already limited to named actions on the table ARN and Mutation.publishPrice.
 */
export function applyNagAcknowledgements(stack: PricingStack): void {
  Validations.of(stack.recompute.role!).acknowledge({
    id: LAMBDA_BASIC,
    reason: 'The AWS-managed basic execution role only grants CloudWatch Logs writes for this function; no custom log policy is maintained for a demo stack.',
  });
  Validations.of(stack.publisher.role!).acknowledge({
    id: LAMBDA_BASIC,
    reason: 'The AWS-managed basic execution role only grants CloudWatch Logs writes for this function; no custom log policy is maintained for a demo stack.',
  });

  const logRetention = stack.node.children.find((c) => c.node.id.startsWith('LogRetention'));
  if (logRetention) {
    Validations.of(logRetention).acknowledge({ id: LAMBDA_BASIC, reason: 'CDK-generated helper function that sets log group retention; its role is not authored here.' });
    Validations.of(logRetention).acknowledge({
      id: `${RULE}IAM5[Resource::*]`,
      reason: 'CDK-generated helper needs logs:PutRetentionPolicy on log groups whose names are only known at deploy time.',
    });
  }

  Validations.of(stack.api.node.findChild('ApiLogsRole')).acknowledge({
    id: APPSYNC_LOGS,
    reason: 'The AWS-managed AppSync logging role is the documented way to let AppSync write field-level error logs.',
  });
  Validations.of(stack.api.node.findChild('TableDs')).acknowledge({
    id: `${RULE}IAM5[Resource::<Pricing947E6495.Arn>/index/*]`,
    reason: 'The AppSync data source role is scoped to this table; /index/* is required to query GSI1 for pricesByCategory.',
  });

  Validations.of(stack.userPool).acknowledge({
    id: `${RULE}COG2`,
    reason: 'MFA is optional (TOTP) in this demo pool; there is no self sign-up and only the admin group can write inputs.',
  });
  Validations.of(stack.userPool).acknowledge({
    id: `${RULE}COG8`,
    reason: 'The Plus feature plan adds a monthly per-user charge; this demo pool has no self sign-up and a 12-character password policy.',
  });

  for (const child of stack.node.children.filter((c) => c.node.id.endsWith('Dlq'))) {
    Validations.of(child).acknowledge({ id: `${RULE}SQS3`, reason: 'This queue is the dead-letter queue itself; a DLQ for the DLQ would only move the problem.' });
  }
}
