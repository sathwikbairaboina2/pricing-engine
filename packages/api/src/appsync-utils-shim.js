import { marshall } from '@aws-sdk/util-dynamodb';

export class AppSyncError extends Error {
  constructor(message, type) {
    super(message);
    this.type = type;
  }
}

export const util = {
  error(message, type) {
    throw new AppSyncError(message, type);
  },
  matches(pattern, value) {
    return new RegExp(pattern).test(String(value));
  },
  time: { nowISO8601: () => new Date().toISOString() },
  dynamodb: { toMapValues: (obj) => marshall(obj, { removeUndefinedValues: true }) },
};

export const runtime = {
  earlyReturn(value) {
    const e = new Error('earlyReturn');
    e.earlyReturn = value;
    throw e;
  },
};
