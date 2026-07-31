export class DeterministicRandom {
  private state: number;

  public constructor(seed: number) {
    this.state = seed >>> 0 || 0x9e3779b9;
  }

  public nextUint32(): number {
    let value = this.state;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.state = value >>> 0;
    return this.state;
  }

  public integer(minimum: number, maximum: number): number {
    if (maximum < minimum) {
      throw new Error("Invalid deterministic random range.");
    }
    return minimum + (this.nextUint32() % (maximum - minimum + 1));
  }

  public boolean(): boolean {
    return (this.nextUint32() & 1) === 1;
  }

  public pick<T>(values: readonly T[]): T {
    const value = values[this.integer(0, values.length - 1)];
    if (value === undefined) {
      throw new Error("Cannot pick from an empty array.");
    }
    return value;
  }
}

const TEXT_PARTS = [
  "atlas",
  "mémoire",
  "日本語",
  "emoji-🧠",
  "line\\nbreak",
  "quote-\"",
  "slash-/",
  "zero-0",
] as const;

export function generatedJsonValue(
  random: DeterministicRandom,
  depth = 0,
): unknown {
  const kind = depth >= 3 ? random.integer(0, 3) : random.integer(0, 5);
  switch (kind) {
    case 0:
      return null;
    case 1:
      return random.boolean();
    case 2:
      return random.integer(-1_000_000, 1_000_000) / 100;
    case 3:
      return `${random.pick(TEXT_PARTS)}-${random.nextUint32()}`;
    case 4: {
      const length = random.integer(0, 6);
      return Array.from({ length }, () => generatedJsonValue(random, depth + 1));
    }
    default: {
      const length = random.integer(0, 6);
      const entries: Array<[string, unknown]> = [];
      for (let index = 0; index < length; index += 1) {
        entries.push([
          `key-${random.nextUint32()}-${index}`,
          generatedJsonValue(random, depth + 1),
        ]);
      }
      return Object.fromEntries(entries);
    }
  }
}

export function reorderObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(reorderObjectKeys);
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .reverse()
      .map(([key, child]) => [key, reorderObjectKeys(child)] as const);
    return Object.fromEntries(entries);
  }
  return value;
}

export function environmentInteger(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}
