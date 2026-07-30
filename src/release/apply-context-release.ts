import { clonePlainData } from "../utils/clone-plain-data.js";
import type { ContextField } from "../contexts/types.js";
import { evaluateContextRelease } from "./evaluate-context-release.js";
import type { ContextReleaseInput } from "./types.js";

export function applyContextRelease(
  field: ContextField,
  input: ContextReleaseInput,
  updatedAt: string,
): ContextField {
  const decision = evaluateContextRelease(input);
  if (!decision.releasable) {
    throw new Error(
      `Context release blocked: ${decision.blockingConditions.join(" ")}`,
    );
  }

  const next = clonePlainData(field);
  const frame = next.frames.find((item) => item.id === input.frame.id);
  if (frame === undefined) {
    throw new Error(`Unknown context frame "${input.frame.id}".`);
  }

  frame.retentionState = input.targetState;
  if (input.targetState === "background" || input.targetState === "compacted") {
    frame.activationState = "background";
    frame.activation = Math.min(frame.activation, 0.28);
  } else {
    frame.activationState = "dormant";
    frame.activation = 0;
  }
  next.revision += 1;
  next.updatedAt = updatedAt;
  return next;
}
