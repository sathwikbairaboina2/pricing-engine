import { createDynamoClients } from '../clients.js';
import { DynamoDBStore } from '../ddb-store.js';
import { createRecomputeHandler } from '../recompute.js';

const tableName = process.env['TABLE_NAME'];
if (!tableName) throw new Error('TABLE_NAME is required');
const { doc } = createDynamoClients();
export const handler = createRecomputeHandler({ store: new DynamoDBStore({ doc, tableName }), now: () => Date.now() });
