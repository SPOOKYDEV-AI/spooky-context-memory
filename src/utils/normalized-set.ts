export function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function uniqueNormalizedStrings(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const trimmed = value.trim();
    const normalized = normalizeText(trimmed);

    if (trimmed.length === 0 || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    result.push(trimmed);
  }

  return result;
}

export function weightedJaccardSimilarity(
  left: readonly string[],
  right: readonly string[],
): number {
  const leftSet = new Set(left.map(normalizeText).filter(Boolean));
  const rightSet = new Set(right.map(normalizeText).filter(Boolean));

  if (leftSet.size === 0 && rightSet.size === 0) {
    return 1;
  }

  const union = new Set([...leftSet, ...rightSet]);
  let intersectionSize = 0;

  for (const item of leftSet) {
    if (rightSet.has(item)) {
      intersectionSize += 1;
    }
  }

  return union.size === 0 ? 0 : intersectionSize / union.size;
}
