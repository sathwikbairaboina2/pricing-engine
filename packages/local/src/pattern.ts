// The subset of EventBridge event patterns used by RECOMPUTE_FILTERS and PUBLISHER_FILTERS.
function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function matchesLeaf(value: unknown, alternatives: unknown[]): boolean {
  return alternatives.some((alt) => {
    if (isObject(alt)) {
      const keys = Object.keys(alt);
      if (keys.length === 1 && keys[0] === 'prefix') return typeof value === 'string' && value.startsWith(String(alt['prefix']));
      throw new Error(`unsupported filter operator: ${keys.join(',')}`);
    }
    return value === alt;
  });
}

export function matchesPattern(event: unknown, pattern: Record<string, unknown>): boolean {
  for (const [key, rule] of Object.entries(pattern)) {
    const value = isObject(event) ? event[key] : undefined;
    if (Array.isArray(rule)) {
      if (!matchesLeaf(value, rule)) return false;
    } else if (isObject(rule)) {
      if (!matchesPattern(value, rule)) return false;
    } else {
      throw new Error(`unsupported filter operator: ${key}`);
    }
  }
  return true;
}

export function matchesAny(event: unknown, patterns: ReadonlyArray<Record<string, unknown>>): boolean {
  return patterns.some((p) => matchesPattern(event, p));
}
