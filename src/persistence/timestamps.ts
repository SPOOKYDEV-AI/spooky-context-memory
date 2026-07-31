const CANONICAL_UTC_TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

/**
 * Accepts only the exact UTC millisecond form emitted by Date#toISOString.
 * This avoids implementation-dependent Date.parse behaviour and prevents two
 * textual timestamps from representing the same instant in persisted hashes.
 */
export function isCanonicalUtcTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !CANONICAL_UTC_TIMESTAMP.test(value)) {
    return false;
  }
  const milliseconds = Date.parse(value);
  return (
    Number.isFinite(milliseconds) &&
    new Date(milliseconds).toISOString() === value
  );
}

export function requireCanonicalUtcTimestamp(
  name: string,
  value: unknown,
): asserts value is string {
  if (!isCanonicalUtcTimestamp(value)) {
    throw new Error(
      `${name} must use canonical UTC millisecond format (YYYY-MM-DDTHH:mm:ss.sssZ).`,
    );
  }
}
