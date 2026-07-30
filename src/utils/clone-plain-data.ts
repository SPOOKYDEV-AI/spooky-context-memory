/**
 * Clones the JSON-compatible data structures used by the memory domain.
 * Functions, symbols, BigInt values and cyclic references are intentionally unsupported.
 */
export function clonePlainData<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
