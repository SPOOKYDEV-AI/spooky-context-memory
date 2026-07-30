import type { Condition } from "../domain/types.js";

function readPath(
  source: Record<string, unknown>,
  path: string,
): unknown {
  return path.split(".").reduce<unknown>((current, segment) => {
    if (
      current === null ||
      typeof current !== "object" ||
      !(segment in current)
    ) {
      return undefined;
    }

    return (current as Record<string, unknown>)[segment];
  }, source);
}

export function evaluateCondition(
  condition: Condition,
  facts: Record<string, unknown>,
): boolean {
  const actual = readPath(facts, condition.field);

  switch (condition.operator) {
    case "equals":
      return Object.is(actual, condition.value);

    case "not_equals":
      return !Object.is(actual, condition.value);

    case "contains":
      if (typeof actual === "string") {
        return actual.includes(String(condition.value));
      }

      if (Array.isArray(actual)) {
        return actual.includes(condition.value);
      }

      return false;

    case "exists":
      return condition.value === false
        ? actual === undefined
        : actual !== undefined;

    case "greater_than":
      return (
        typeof actual === "number" &&
        typeof condition.value === "number" &&
        actual > condition.value
      );

    case "matches":
      return (
        typeof actual === "string" &&
        typeof condition.value === "string" &&
        new RegExp(condition.value).test(actual)
      );
  }
}
