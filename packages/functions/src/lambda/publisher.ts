import { AppSyncPublisher } from '../appsync-publisher.js';
import { createPublisherHandler } from '../publisher.js';

const url = process.env['APPSYNC_URL'];
const region = process.env['AWS_REGION'];
if (!url) throw new Error('APPSYNC_URL is required');
if (!region) throw new Error('AWS_REGION is required');
export const handler = createPublisherHandler({ publisher: new AppSyncPublisher({ url, region }) });
