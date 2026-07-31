export type CanonicalJsonPrimitive = string | number | boolean | null;
export type CanonicalJsonValue =
  | CanonicalJsonPrimitive
  | CanonicalJsonValue[]
  | { [key: string]: CanonicalJsonValue };

const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function isPlainObject(value: object): boolean {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function normalize(
  value: unknown,
  path: string,
  ancestors: Set<object>,
): CanonicalJsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`Non-finite number at ${path} is not valid JSON data.`);
    }
    return Object.is(value, -0) ? 0 : value;
  }
  if (
    typeof value === "undefined" ||
    typeof value === "function" ||
    typeof value === "symbol" ||
    typeof value === "bigint"
  ) {
    throw new Error(`Unsupported JSON value at ${path}: ${typeof value}.`);
  }
  if (typeof value !== "object") {
    throw new Error(`Unsupported JSON value at ${path}.`);
  }
  if (ancestors.has(value)) {
    throw new Error(`Cyclic JSON value detected at ${path}.`);
  }
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return Array.from({ length: value.length }, (_, index) =>
        index in value
          ? normalize(value[index], `${path}[${index}]`, ancestors)
          : null,
      );
    }
    if (!isPlainObject(value)) {
      throw new Error(
        `Non-plain object at ${path} cannot be persisted deterministically.`,
      );
    }
    const record = value as Record<string, unknown>;
    const normalized: Record<string, CanonicalJsonValue> = {};
    for (const key of Object.keys(record).sort()) {
      if (FORBIDDEN_KEYS.has(key)) {
        throw new Error(`Forbidden object key "${key}" at ${path}.`);
      }
      normalized[key] = normalize(record[key], `${path}.${key}`, ancestors);
    }
    return normalized;
  } finally {
    ancestors.delete(value);
  }
}

export function normalizeCanonicalJson(value: unknown): CanonicalJsonValue {
  return normalize(value, "$", new Set<object>());
}

export function canonicalJsonStringify(value: unknown): string {
  return JSON.stringify(normalizeCanonicalJson(value));
}
