import type {
  CompilePreflightOptions,
  MemoryPreflight,
} from "./types.js";

function section(title: string, values: readonly string[]): string[] {
  if (values.length === 0) {
    return [];
  }

  return [title, ...values.map((value) => `- ${value}`)];
}

export function compilePreflightContext(
  preflight: MemoryPreflight,
  options: CompilePreflightOptions = {},
): string {
  const lines = [
    options.heading ?? "Memory Preflight",
    `Knowledge state: ${preflight.knowledgeState}`,
    "",
    ...section("Must preserve:", preflight.mustPreserve),
    "",
    ...section("Known failure modes:", preflight.knownFailureModes),
    "",
    ...section("Pruned approaches:", preflight.prunedApproaches),
    "",
    ...section("Verify before acting:", preflight.verifyBeforeActing),
    "",
    ...section("Unresolved unknowns:", preflight.unresolvedUnknowns),
  ];
  const normalized = lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const maximum = Math.max(200, options.maxCharacters ?? 2_000);

  if (normalized.length <= maximum) {
    return normalized;
  }

  return `${normalized.slice(0, maximum - 16).trimEnd()}\n...[truncated]`;
}
