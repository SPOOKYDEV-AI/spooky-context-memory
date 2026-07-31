import { describe, expect, it } from "vitest";
import {
  canonicalJsonStringify,
  hashPlainData,
  normalizeCanonicalJson,
} from "../src/index.js";
import {
  DeterministicRandom,
  environmentInteger,
  generatedJsonValue,
  reorderObjectKeys,
} from "./support/reliability-generators.js";

const cases = environmentInteger("SPOOKY_GAUNTLET_CASES", 25_000);
const shard = environmentInteger("SPOOKY_GAUNTLET_SHARD", 1);
const seed = (0x70_71_00_00 + shard) >>> 0;
const timeoutMs = environmentInteger(
  "SPOOKY_GAUNTLET_TIMEOUT_MS",
  Math.max(30_000, Math.ceil(cases / 10_000) * 3_000),
);

describe("persistence property reliability gauntlet", () => {
  it(`preserves canonical hashes across ${cases.toLocaleString()} generated JSON cases`, () => {
    const random = new DeterministicRandom(seed);
    for (let index = 0; index < cases; index += 1) {
      const value = generatedJsonValue(random);
      const reordered = reorderObjectKeys(value);
      const serialized = canonicalJsonStringify(value);
      const reorderedSerialized = canonicalJsonStringify(reordered);
      if (serialized !== reorderedSerialized) {
        throw new Error(
          `Canonical ordering diverged at seed=${seed}, case=${index}.`,
        );
      }
      const parsed: unknown = JSON.parse(serialized);
      if (hashPlainData(value) !== hashPlainData(parsed)) {
        throw new Error(
          `Round-trip hash diverged at seed=${seed}, case=${index}.`,
        );
      }
      const envelopeA = { payload: value, mutationMarker: index };
      const envelopeB = { payload: value, mutationMarker: index + 1 };
      if (hashPlainData(envelopeA) === hashPlainData(envelopeB)) {
        throw new Error(
          `Mutation was not detected at seed=${seed}, case=${index}.`,
        );
      }
    }
  }, timeoutMs);

  it("rejects values that cannot be persisted deterministically", () => {
    expect(() => normalizeCanonicalJson(Number.NaN)).toThrow("Non-finite");
    expect(() => normalizeCanonicalJson(Number.POSITIVE_INFINITY)).toThrow(
      "Non-finite",
    );
    expect(() => normalizeCanonicalJson(undefined)).toThrow("Unsupported");
    expect(() => normalizeCanonicalJson(1n)).toThrow("Unsupported");
    expect(() => normalizeCanonicalJson(new Date())).toThrow("Non-plain");
    expect(normalizeCanonicalJson(Array(2))).toEqual([null, null]);
    expect(() => normalizeCanonicalJson(JSON.parse('{"__proto__": null}'))).toThrow(
      "Forbidden",
    );
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    expect(() => normalizeCanonicalJson(cyclic)).toThrow("Cyclic");
  });
});
