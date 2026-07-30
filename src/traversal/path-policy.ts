import type { TraversalPolicy } from "../domain/types.js";

function isInsidePrefix(path: string, prefix: string): boolean {
  if (prefix === "/") {
    return true;
  }

  return path === prefix || path.startsWith(`${prefix}/`);
}

export function isPathAllowed(
  path: string,
  policy: Pick<
    TraversalPolicy,
    "allowedPathPrefixes" | "deniedPathPrefixes"
  >,
): boolean {
  const denied = policy.deniedPathPrefixes.some((prefix) =>
    isInsidePrefix(path, prefix),
  );

  if (denied) {
    return false;
  }

  if (policy.allowedPathPrefixes.length === 0) {
    return true;
  }

  return policy.allowedPathPrefixes.some((prefix) =>
    isInsidePrefix(path, prefix),
  );
}
