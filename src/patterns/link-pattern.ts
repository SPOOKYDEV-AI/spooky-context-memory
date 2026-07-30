import { clonePlainData } from "../utils/clone-plain-data.js";
import type {
  ExperiencePattern,
  PatternRelationRecord,
} from "./types.js";

export function linkExperiencePattern(
  pattern: ExperiencePattern,
  relation: PatternRelationRecord,
): ExperiencePattern {
  const next = clonePlainData(pattern);
  const duplicate = next.relations.some(
    (item) =>
      item.type === relation.type && item.patternId === relation.patternId,
  );

  if (!duplicate) {
    next.relations.push(clonePlainData(relation));
    next.version += 1;
  }

  if (relation.type === "supersedes") {
    next.lifecycle.status = "active";
  }

  if (relation.type === "contradicts") {
    next.lifecycle.status = "disputed";
  }

  return next;
}
