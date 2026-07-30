import { stableHash } from "../utils/stable-hash.js";
import type {
  ProgressiveVisionEnsemblePolicy,
  VisionLoopCheckInput,
  VisionLoopCheckResult,
} from "./progressive-types.js";

interface LoopEntry {
  visionId: string;
  bestProgress: number;
  evidenceFingerprint: string;
  repeatedWithoutProgress: number;
}

export interface VisionLoopGuardPolicy {
  minimumProgress: number;
  maxRevisitsWithoutProgress: number;
}

const DEFAULT_POLICY: VisionLoopGuardPolicy = {
  minimumProgress: 0.02,
  maxRevisitsWithoutProgress: 1,
};

export class VisionLoopGuard {
  private readonly entries = new Map<string, LoopEntry>();
  private readonly policy: VisionLoopGuardPolicy;

  public constructor(policy: Partial<VisionLoopGuardPolicy> = {}) {
    this.policy = {
      ...DEFAULT_POLICY,
      ...policy,
    };
  }

  public checkAndRecord(input: VisionLoopCheckInput): VisionLoopCheckResult {
    const signature = stableHash({
      visionId: input.visionId,
      contextFingerprint:
        input.contextFingerprint ?? `revision:${input.contextRevision}`,
      currentNodeId: input.currentNodeId,
      unresolvedQuestions: [...input.unresolvedQuestions].sort(),
      constraints: [...input.constraints].sort(),
    });
    const evidenceFingerprint = stableHash([...input.evidenceIds].sort());
    const previous = this.entries.get(signature);

    if (previous === undefined) {
      this.entries.set(signature, {
        visionId: input.visionId,
        bestProgress: input.progressScore,
        evidenceFingerprint,
        repeatedWithoutProgress: 0,
      });

      return {
        allowed: true,
        signature,
        repeatedWithoutProgress: 0,
        reason: "The exploration state has not been visited in this context revision.",
      };
    }

    const hasProgress =
      input.progressScore >= previous.bestProgress + this.policy.minimumProgress;
    const hasNewEvidence = evidenceFingerprint !== previous.evidenceFingerprint;

    if (hasProgress || hasNewEvidence) {
      this.entries.set(signature, {
        visionId: input.visionId,
        bestProgress: Math.max(previous.bestProgress, input.progressScore),
        evidenceFingerprint,
        repeatedWithoutProgress: 0,
      });

      return {
        allowed: true,
        signature,
        repeatedWithoutProgress: 0,
        reason: hasProgress
          ? "The state may be revisited because measurable progress was made."
          : "The state may be revisited because independent evidence changed.",
      };
    }

    const repeatedWithoutProgress = previous.repeatedWithoutProgress + 1;
    const allowed =
      repeatedWithoutProgress <= this.policy.maxRevisitsWithoutProgress;
    this.entries.set(signature, {
      ...previous,
      repeatedWithoutProgress,
    });

    return {
      allowed,
      signature,
      repeatedWithoutProgress,
      reason: allowed
        ? "One bounded revisit is allowed before the state is treated as a loop."
        : "The same exploration state was revisited without new evidence or progress.",
    };
  }

  public clearVision(visionId: string): number {
    let removed = 0;

    for (const [signature, entry] of this.entries) {
      if (entry.visionId === visionId) {
        this.entries.delete(signature);
        removed += 1;
      }
    }

    return removed;
  }

  public clear(): void {
    this.entries.clear();
  }
}

export function createVisionLoopGuardFromPolicy(
  policy: Pick<
    ProgressiveVisionEnsemblePolicy,
    "minimumLoopProgress" | "maxRevisitsWithoutProgress"
  >,
): VisionLoopGuard {
  return new VisionLoopGuard({
    minimumProgress: policy.minimumLoopProgress,
    maxRevisitsWithoutProgress: policy.maxRevisitsWithoutProgress,
  });
}
