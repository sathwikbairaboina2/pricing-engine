import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import * as appsync from 'aws-cdk-lib/aws-appsync';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { DynamoEventSource, SqsDlq } from 'aws-cdk-lib/aws-lambda-event-sources';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import type { Construct } from 'constructs';
import { PUBLISHER_FILTERS, RECOMPUTE_FILTERS } from '@pricing-engine/functions';
import { RESOLVERS, resolverPath, schemaPath } from '@pricing-engine/api';

export interface PricingStackProps extends StackProps { functionsDistDir?: string }

const defaultDist = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'packages', 'functions', 'dist');

export class PricingStack extends Stack {
  readonly table: dynamodb.TableV2;
  readonly api: appsync.GraphqlApi;
  readonly recompute: lambda.Function;
  readonly publisher: lambda.Function;
  readonly userPool: cognito.UserPool;

  constructor(scope: Construct, id: string, props: PricingStackProps = {}) {
    super(scope, id, props);
    const dist = props.functionsDistDir ?? defaultDist;

    this.table = new dynamodb.TableV2(this, 'Pricing', {
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      dynamoStream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
      timeToLiveAttribute: 'ttl',
      globalSecondaryIndexes: [
        {
          indexName: 'GSI1',
          partitionKey: { name: 'GSI1PK', type: dynamodb.AttributeType.STRING },
          sortKey: { name: 'GSI1SK', type: dynamodb.AttributeType.STRING },
        },
      ],
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const dlq = (name: string) =>
      new sqs.Queue(this, name, { enforceSSL: true, retentionPeriod: Duration.days(14) });
    const recomputeDlq = dlq('RecomputeDlq');
    const publisherDlq = dlq('PublisherDlq');

    this.userPool = new cognito.UserPool(this, 'UserPool', {
      selfSignUpEnabled: false,
      passwordPolicy: { minLength: 12, requireDigits: true, requireLowercase: true, requireUppercase: true, requireSymbols: true },
      mfa: cognito.Mfa.OPTIONAL,
      mfaSecondFactor: { otp: true, sms: false },
      removalPolicy: RemovalPolicy.DESTROY,
    });
    new cognito.CfnUserPoolGroup(this, 'AdminGroup', { userPoolId: this.userPool.userPoolId, groupName: 'admin' });

    this.api = new appsync.GraphqlApi(this, 'Api', {
      name: 'pricing-engine',
      definition: appsync.Definition.fromFile(schemaPath),
      authorizationConfig: {
        defaultAuthorization: { authorizationType: appsync.AuthorizationType.USER_POOL, userPoolConfig: { userPool: this.userPool } },
        additionalAuthorizationModes: [{ authorizationType: appsync.AuthorizationType.IAM }],
      },
      logConfig: { fieldLogLevel: appsync.FieldLogLevel.ERROR, retention: logs.RetentionDays.ONE_MONTH },
      xrayEnabled: true,
    });

    const common = {
      runtime: lambda.Runtime.NODEJS_24_X,
      architecture: lambda.Architecture.ARM_64,
      handler: 'index.handler',
      memorySize: 512,
      timeout: Duration.seconds(30),
    };

    this.recompute = new lambda.Function(this, 'Recompute', {
      ...common,
      code: lambda.Code.fromAsset(join(dist, 'recompute')),
      environment: { TABLE_NAME: this.table.tableName },
    });
    this.recompute.addToRolePolicy(new iam.PolicyStatement({
      actions: ['dynamodb:Query', 'dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:ConditionCheckItem'],
      resources: [this.table.tableArn],
    }));

    this.publisher = new lambda.Function(this, 'Publisher', {
      ...common,
      code: lambda.Code.fromAsset(join(dist, 'publisher')),
      environment: { APPSYNC_URL: this.api.graphqlUrl },
    });
    this.api.grantMutation(this.publisher, 'publishPrice');

    const source = (filters: ReadonlyArray<Record<string, unknown>>, queue: sqs.Queue) =>
      new DynamoEventSource(this.table, {
        startingPosition: lambda.StartingPosition.LATEST,
        batchSize: 100,
        bisectBatchOnError: true,
        retryAttempts: 3,
        reportBatchItemFailures: true,
        onFailure: new SqsDlq(queue),
        filters: filters.map((f) => lambda.FilterCriteria.filter(f as Record<string, unknown>)),
      });
    this.recompute.addEventSource(source(RECOMPUTE_FILTERS, recomputeDlq));
    this.publisher.addEventSource(source(PUBLISHER_FILTERS, publisherDlq));

    const tableDs = this.api.addDynamoDbDataSource('TableDs', this.table);
    const noneDs = this.api.addNoneDataSource('NoneDs');
    for (const r of RESOLVERS) {
      (r.dataSource === 'TABLE' ? tableDs : noneDs).createResolver(`${r.typeName}${r.fieldName}Resolver`, {
        typeName: r.typeName,
        fieldName: r.fieldName,
        runtime: appsync.FunctionRuntime.JS_1_0_0,
        code: appsync.Code.fromAsset(resolverPath(r.typeName, r.fieldName)),
      });
    }

    new CfnOutput(this, 'GraphqlUrl', { value: this.api.graphqlUrl });
    new CfnOutput(this, 'TableName', { value: this.table.tableName });
  }
}
