import { clonePlainData } from "../utils/clone-plain-data.js";
import type { OutcomeVerdict } from "../episodes/types.js";
import type { Situation, SituationState } from "./types.js";

export interface CloseSituationInput {
  outcome: OutcomeVerdict;
  state: Extract<
    SituationState,
    "resolved" | "abandoned" | "superseded" | "unresolved"
  >;
  closedAt: string;
  accumulatorId?: string;
}

export function closeSituation(
  situation: Situation,
  input: CloseSituationInput,
): Situation {
  if (situation.phase !== "validation" && input.state === "resolved") {
    throw new Error("A resolved situation must be closed from validation.");
  }

  const next = clonePlainData(situation);
  next.phase = "closed";
  next.state = input.state;
  next.outcome = input.outcome;
  next.accumulatorId = input.accumulatorId ?? next.accumulatorId;
  next.updatedAt = input.closedAt;
  next.closedAt = input.closedAt;
  return next;
}
