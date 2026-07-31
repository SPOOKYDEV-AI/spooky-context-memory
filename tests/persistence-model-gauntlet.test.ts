import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  FileEventJournal,
  FileSnapshotStore,
  replayMemoryStream,
  verifyDeterministicReplay,
  type ProjectedMemoryEvent,
} from "../src/index.js";
import {
  DeterministicRandom,
  environmentInteger,
} from "./support/reliability-generators.js";

interface CounterState {
  total: number;
}

const roots = new Set<string>();
const scenarios = environmentInteger("SPOOKY_MODEL_SCENARIOS", 16);
const steps = environmentInteger("SPOOKY_MODEL_STEPS", 24);
const shard = environmentInteger("SPOOKY_GAUNTLET_SHARD", 1);
const seed = (0x70_71_10_00 + shard) >>> 0;
const timeoutMs = environmentInteger(
  "SPOOKY_MODEL_TIMEOUT_MS",
  Math.max(60_000, scenarios * steps * 50),
);
const cleanupTimeoutMs = environmentInteger(
  "SPOOKY_MODEL_CLEANUP_TIMEOUT_MS",
  60_000,
);


function generatedOccurredAt(
  scenario: number,
  step: number,
  index: number,
): string {
  const offsetMilliseconds =
    ((scenario * steps + step) * 4 + index) * 1_000;
  return new Date(
    Date.UTC(2026, 6, 31, 0, 0, 0, offsetMilliseconds),
  ).toISOString();
}

function reducer(state: CounterState, event: ProjectedMemoryEvent): CounterState {
  const payload = event.payload as { amount: number };
  return { total: state.total + payload.amount };
}

function isRetryableCleanupError(error: unknown): boolean {
  if (!(error instanceof Error) || !("code" in error)) {
    return false;
  }
  return ["EBUSY", "ENOTEMPTY", "EPERM"].includes(String(error.code));
}

async function removeTemporaryRoot(root: string): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      await rm(root, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 100,
      });
      roots.delete(root);
      return;
    } catch (error) {
      lastError = error;
      if (!isRetryableCleanupError(error) || attempt === 11) {
        throw error;
      }
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(1_000, 50 * 2 ** attempt)),
      );
    }
  }
  throw lastError;
}

afterEach(async () => {
  for (const root of [...roots]) {
    await removeTemporaryRoot(root);
  }
}, cleanupTimeoutMs);

describe("model-based persistence gauntlet", () => {
  it(
    `matches a reference counter across ${scenarios} generated state-machine scenarios`,
    async () => {
      const random = new DeterministicRandom(seed);
      for (let scenario = 0; scenario < scenarios; scenario += 1) {
        const root = await mkdtemp(join(tmpdir(), "spooky-model-gauntlet-"));
        roots.add(root);
        try {
          const journal = new FileEventJournal({ rootDirectory: root });
          const snapshots = new FileSnapshotStore({ rootDirectory: root });
          let modelTotal = 0;
          let modelSequence = 0;
          let latestEventHash = "GENESIS";

          for (let step = 0; step < steps; step += 1) {
            const action = random.integer(0, 99);
            if (action < 60) {
              const batchSize = random.integer(1, 4);
              const amounts = Array.from({ length: batchSize }, () =>
                random.integer(-50, 50),
              );
              const persisted = await journal.append(
                "counter",
                amounts.map((amount, index) => ({
                  type: "counter.added",
                  payload: { amount },
                  schemaVersion: 1,
                  occurredAt: generatedOccurredAt(scenario, step, index),
                })),
                { expectedSequence: modelSequence },
              );
              modelTotal += amounts.reduce((sum, value) => sum + value, 0);
              modelSequence += batchSize;
              latestEventHash = persisted.at(-1)!.eventHash;
            } else if (action < 72) {
              await expect(
                journal.append(
                  "counter",
                  [
                    {
                      type: "counter.added",
                      payload: { amount: 999 },
                      schemaVersion: 1,
                      occurredAt: "2026-07-31T00:00:00.000Z",
                    },
                  ],
                  {
                    expectedSequence:
                      modelSequence === 0 ? 1 : modelSequence - 1,
                  },
                ),
              ).rejects.toThrow("Optimistic concurrency conflict");
            } else if (action < 86) {
              await snapshots.save({
                streamId: "counter",
                sequence: modelSequence,
                eventHash: latestEventHash,
                schemaVersion: 1,
                state: { total: modelTotal },
                createdAt: `2026-07-31T01:00:${String(modelSequence % 60).padStart(2, "0")}.000Z`,
              });
            } else {
              const replay = await replayMemoryStream({
                streamId: "counter",
                journal,
                snapshots,
                targetSchemaVersion: 1,
                initialState: { total: 0 },
                reducer,
              });
              if (
                replay.state.total !== modelTotal ||
                replay.finalSequence !== modelSequence
              ) {
                throw new Error(
                  `Model divergence seed=${seed}, scenario=${scenario}, step=${step}.`,
                );
              }
            }
          }

          const verification = await verifyDeterministicReplay({
            streamId: "counter",
            journal,
            snapshots,
            targetSchemaVersion: 1,
            initialState: { total: 0 },
            reducer,
          });
          expect(verification.deterministic).toBe(true);
          expect(verification.first.state.total).toBe(modelTotal);
          expect(verification.first.finalSequence).toBe(modelSequence);
        } finally {
          await removeTemporaryRoot(root);
        }
      }
    },
    timeoutMs,
  );
});
