import { describe, expect, it } from "vitest";
import { isPathAllowed } from "../src/traversal/path-policy.js";

describe("isPathAllowed", () => {
  it("allows descendants of an allowed path", () => {
    expect(
      isPathAllowed("/projects/atlas/incidents", {
        allowedPathPrefixes: ["/projects/atlas"],
        deniedPathPrefixes: [],
      }),
    ).toBe(true);
  });

  it("lets denied paths override allowed paths", () => {
    expect(
      isPathAllowed("/projects/atlas/secrets/api-key", {
        allowedPathPrefixes: ["/projects/atlas"],
        deniedPathPrefixes: ["/projects/atlas/secrets"],
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
