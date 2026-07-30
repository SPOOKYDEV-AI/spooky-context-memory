import { describe, expect, it } from "vitest";
import {
  compactContextFrame,
  createEmptyContextField,
  pinContextFrame,
  reactivateContextFrame,
  reconstructTransitionPath,
  unpinContextFrame,
  updateContextField,
} from "../src/index.js";

const T0 = "2026-07-30T14:00:00.000Z";
const T1 = "2026-07-30T14:01:00.000Z";
const T2 = "2026-07-30T14:02:00.000Z";

function firstContext() {
  return updateContextField(createEmptyContextField(T0), {
    topic: "Design a persistent contextual memory engine",
    intent: "design_memory_engine",
    summary: "Preserve useful experience without keeping every raw turn.",
    scope: { projectId: "project-atlas", workflowId: "architecture" },
    turnId: "turn-1",
    observedAt: T0,
    relevance: 1,
  }).field;
}

describe("context flow", () => {
  it("creates a dominant context from the first signal", () => {
    const field = firstContext();
    expect(field.frames).toHaveLength(1);
    expect(field.frames[0]?.activationState).toBe("dominant");
  });

  it("continues an existing context instead of duplicating it", () => {
    const field = firstContext();
    const next = updateContextField(field, {
      topic: "Persistent contextual memory architecture",
      intent: "design_memory_engine",
      scope: { projectId: "project-atlas", workflowId: "architecture" },
      turnId: "turn-2",
      observedAt: T1,
    });

    expect(next.shift.kind).toBe("continuation");
    expect(next.field.frames).toHaveLength(1);
  });

  it("introduces a new context progressively without erasing the old one", () => {
    const field = firstContext();
    const next = updateContextField(field, {
      topic: "Prepare a public release note",
      intent: "write_release_note",
      scope: { projectId: "project-atlas", workflowId: "release" },
      turnId: "turn-2",
      observedAt: T1,
      explicitShift: true,
      transitionTrigger: "digression",
      bridge: "The architecture discussion moved temporarily to release work.",
    });

    expect(next.field.frames).toHaveLength(2);
    const oldFrame = next.field.frames.find(
      (frame) => frame.topic.includes("persistent contextual"),
    );
    expect(oldFrame?.activation).toBeGreaterThan(0);
    expect(oldFrame?.activationState).not.toBe("dominant");
    expect(next.field.transitions).toHaveLength(1);
  });

  it("keeps pinned context above the minimum active trace", () => {
    const field = firstContext();
    const contextId = field.frames[0]!.id;
    let next = pinContextFrame(field, contextId, "Initial need must survive validation.");

    for (let index = 0; index < 8; index += 1) {
      next = updateContextField(next, {
        topic: `Independent side topic ${index}`,
        intent: `side_topic_${index}`,
        scope: { projectId: "project-aurora", workflowId: "other" },
        turnId: `turn-side-${index}`,
        observedAt: `2026-07-30T14:${String(index + 2).padStart(2, "0")}:00.000Z`,
        explicitShift: true,
      }).field;
    }

    const pinned = next.frames.find((frame) => frame.id === contextId);
    expect(pinned?.retentionState).toBe("pinned");
    expect(pinned?.activation).toBeGreaterThanOrEqual(0.34);
  });

  it("refuses to remove protection without verified transfer", () => {
    const field = firstContext();
    const contextId = field.frames[0]!.id;
    const pinned = pinContextFrame(field, contextId, "Keep initial contract.");
    expect(() =>
      unpinContextFrame(pinned, contextId, {
        transferVerified: false,
        updatedAt: T1,
      }),
    ).toThrow(/verified transfer/i);
  });

  it("refuses to compact pinned context", () => {
    const field = firstContext();
    const contextId = field.frames[0]!.id;
    const pinned = pinContextFrame(field, contextId, "Keep initial contract.");
    expect(() => compactContextFrame(pinned, contextId, "Compact summary")).toThrow(
      /pinned/i,
    );
  });

  it("reactivates a dormant or background context by identifier", () => {
    const field = firstContext();
    const contextId = field.frames[0]!.id;
    const shifted = updateContextField(field, {
      topic: "Unrelated deployment event",
      intent: "deploy",
      scope: { projectId: "project-aurora", workflowId: "deployment" },
      turnId: "turn-2",
      observedAt: T1,
      explicitShift: true,
    }).field;
    const reactivated = reactivateContextFrame(shifted, contextId, "turn-3", T2);
    expect(
      reactivated.frames.find((frame) => frame.id === contextId)?.activationState,
    ).toBe("dominant");
  });

  it("reconstructs how the conversation moved between contexts", () => {
    const initial = firstContext();
    const firstId = initial.frames[0]!.id;
    const shifted = updateContextField(initial, {
      topic: "Release note",
      intent: "write_release_note",
      scope: { projectId: "project-atlas", workflowId: "release" },
      turnId: "turn-2",
      observedAt: T1,
      explicitShift: true,
      bridge: "We moved from architecture to publication.",
    }).field;
    const secondId = shifted.frames.find((frame) => frame.id !== firstId)!.id;
    const path = reconstructTransitionPath(shifted.transitions, firstId, secondId);
    expect(path).toHaveLength(1);
    expect(path[0]?.bridge).toContain("architecture to publication");
  });
});
