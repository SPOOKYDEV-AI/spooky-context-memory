export interface PublicDataPolicy {
  forbiddenIdentifiers: string[];
  forbiddenPathFragments: string[];
}

export interface PublicDataAssessment {
  allowed: boolean;
  matches: string[];
}

export function assessPublicData(
  value: unknown,
  policy: PublicDataPolicy,
): PublicDataAssessment {
  const serialized = (JSON.stringify(value) ?? String(value)).toLowerCase();
  const matches = [
    ...policy.forbiddenIdentifiers,
    ...policy.forbiddenPathFragments,
  ].filter((token) => serialized.includes(token.toLowerCase()));

  return {
    allowed: matches.length === 0,
    matches: Array.from(new Set(matches)),
  };
}

export function assertPublicData(
  value: unknown,
  policy: PublicDataPolicy,
): void {
  const assessment = assessPublicData(value, policy);

  if (!assessment.allowed) {
    throw new Error(
      `Public fixture rejected because it contains private markers: ${assessment.matches.join(", ")}.`,
    );
  }
}
