import { describe, expect, it } from "vitest";
import { isPathAllowed } from "../src/traversal/path-policy.js";

describe("isPathAllowed", () => {
  it("allows descendants of an allowed path", () => {
    expect(
      isPathAllowed("/projects/asr/incidents", {
        allowedPathPrefixes: ["/projects/asr"],
        deniedPathPrefixes: [],
      }),
    ).toBe(true);
  });

  it("lets denied paths override allowed paths", () => {
    expect(
      isPathAllowed("/projects/asr/secrets/api-key", {
        allowedPathPrefixes: ["/projects/asr"],
        deniedPathPrefixes: ["/projects/asr/secrets"],
      }),
    ).toBe(false);
  });

  it("allows every non-denied path when no allowed prefix is configured", () => {
    expect(
      isPathAllowed("/shared-skills/typescript", {
        allowedPathPrefixes: [],
        deniedPathPrefixes: ["/personal"],
      }),
    ).toBe(true);
  });
});
