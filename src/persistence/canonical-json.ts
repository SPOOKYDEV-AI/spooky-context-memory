export type CanonicalJsonPrimitive = string | number | boolean | null;
export type CanonicalJsonValue =
  | CanonicalJsonPrimitive
  | CanonicalJsonValue[]
  | { [key: string]: CanonicalJsonValue };

export interface CanonicalJsonLimits {
  maxDepth?: number;
  maxNodes?: number;
  maxArrayLength?: number;
  maxObjectKeys?: number;
  maxStringLength?: number;
}

interface ResolvedCanonicalJsonLimits {
  maxDepth: number;
  maxNodes: number;
  maxArrayLength: number;
  maxObjectKeys: number;
  maxStringLength: number;
}

interface NormalizationState {
  nodes: number;
}

const DEFAULT_LIMITS: ResolvedCanonicalJsonLimits = {
  maxDepth: 256,
  maxNodes: 1_000_000,
  maxArrayLength: 1_000_000,
  maxObjectKeys: 100_000,
  maxStringLength: 16 * 1024 * 1024,
};

const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function isPlainObject(value: object): boolean {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function positiveSafeInteger(
  name: keyof ResolvedCanonicalJsonLimits,
  value: number,
): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive safe integer.`);
  }
  return value;
}

function resolveLimits(
  limits: CanonicalJsonLimits | undefined,
): ResolvedCanonicalJsonLimits {
  return {
    maxDepth: positiveSafeInteger(
      "maxDepth",
      limits?.maxDepth ?? DEFAULT_LIMITS.maxDepth,
    ),
    maxNodes: positiveSafeInteger(
      "maxNodes",
      limits?.maxNodes ?? DEFAULT_LIMITS.maxNodes,
    ),
    maxArrayLength: positiveSafeInteger(
      "maxArrayLength",
      limits?.maxArrayLength ?? DEFAULT_LIMITS.maxArrayLength,
    ),
    maxObjectKeys: positiveSafeInteger(
      "maxObjectKeys",
      limits?.maxObjectKeys ?? DEFAULT_LIMITS.maxObjectKeys,
    ),
    maxStringLength: positiveSafeInteger(
      "maxStringLength",
      limits?.maxStringLength ?? DEFAULT_LIMITS.maxStringLength,
    ),
  };
}

function normalize(
  value: unknown,
  path: string,
  ancestors: Set<object>,
  depth: number,
  state: NormalizationState,
  limits: ResolvedCanonicalJsonLimits,
): CanonicalJsonValue {
  if (depth > limits.maxDepth) {
    throw new Error(
      `Canonical JSON depth limit ${limits.maxDepth} exceeded at ${path}.`,
    );
  }
  state.nodes += 1;
  if (state.nodes > limits.maxNodes) {
    throw new Error(
      `Canonical JSON node limit ${limits.maxNodes} exceeded at ${path}.`,
    );
  }

  if (value === null || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    if (value.length > limits.maxStringLength) {
      throw new Error(
        `Canonical JSON string limit ${limits.maxStringLength} exceeded at ${path}.`,
      );
    }
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
      if (value.length > limits.maxArrayLength) {
        throw new Error(
          `Canonical JSON array limit ${limits.maxArrayLength} exceeded at ${path}.`,
        );
      }
      return Array.from({ length: value.length }, (_, index) =>
        index in value
          ? normalize(
              value[index],
              `${path}[${index}]`,
              ancestors,
              depth + 1,
              state,
              limits,
            )
          : null,
      );
    }
    if (!isPlainObject(value)) {
      throw new Error(
        `Non-plain object at ${path} cannot be persisted deterministically.`,
      );
    }
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    if (keys.length > limits.maxObjectKeys) {
      throw new Error(
        `Canonical JSON object-key limit ${limits.maxObjectKeys} exceeded at ${path}.`,
      );
    }
    const normalized: Record<string, CanonicalJsonValue> = {};
    for (const key of keys) {
      if (FORBIDDEN_KEYS.has(key)) {
        throw new Error(`Forbidden object key "${key}" at ${path}.`);
      }
      const propertyValue = record[key];
      normalized[key] = normalize(
        propertyValue,
        `${path}.${key}`,
        ancestors,
        depth + 1,
        state,
        limits,
      );
    }
    return normalized;
  } finally {
    ancestors.delete(value);
  }
}

export function normalizeCanonicalJson(
  value: unknown,
  limits?: CanonicalJsonLimits,
): CanonicalJsonValue {
  return normalize(
    value,
    "$",
    new Set<object>(),
    0,
    { nodes: 0 },
    resolveLimits(limits),
  );
}

export function canonicalJsonStringify(
  value: unknown,
  limits?: CanonicalJsonLimits,
): string {
  return JSON.stringify(normalizeCanonicalJson(value, limits));
}
