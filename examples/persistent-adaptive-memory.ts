import { mkdir, rm } from "node:fs/promises";
import {
  FileEventJournal,
  FileSnapshotStore,
  PersistentAdaptiveMemory,
  createEmptyAdaptiveMemoryDurableState,
} from "../src/index.js";

const rootDirectory = ".context-memory/private/synthetic-demo";
await rm(rootDirectory, { recursive: true, force: true });
await mkdir(rootDirectory, { recursive: true });

const journal = new FileEventJournal({ rootDirectory });
const snapshots = new FileSnapshotStore({ rootDirectory });
const memory = new PersistentAdaptiveMemory({
  streamId: "synthetic-project-atlas",
  journal,
  snapshots,
  policy: {
    snapshotEveryEvents: 2,
    maximumSnapshots: 3,
    classification: "private",
  },
});

await memory.importState(
  createEmptyAdaptiveMemoryDurableState("2026-07-31T00:00:00.000Z"),
  "2026-07-31T00:00:00.000Z",
  0,
);

await memory.append(
  [
    {
      type: "memory.node_upserted",
      schemaVersion: 1,
      occurredAt: "2026-07-31T00:01:00.000Z",
      classification: "private",
      contextFingerprint: "synthetic-atlas-context-v1",
      payload: {
        node: {
          id: "synthetic-project-root",
          parentId: null,
          path: "/synthetic-project-root",
          type: "project",
          status: "active",
          title: "Synthetic Atlas",
          summary: "A public synthetic persistence example.",
          scope: { projectId: "synthetic-project-atlas" },
          metadata: {
            confidence: 1,
            sourceTrust: 1,
            createdAt: "2026-07-31T00:01:00.000Z",
            updatedAt: "2026-07-31T00:01:00.000Z",
          },
          provenance: {
            sourceType: "documentation",
            createdBy: "persistent-adaptive-memory-example",
          },
        },
      },
    },
  ],
  1,
);

const hydrated = await memory.hydrate();
console.log({
  sequence: hydrated.sequence,
  eventHash: hydrated.eventHash,
  snapshotId: hydrated.snapshotId,
  replayedEvents: hydrated.replayedEventCount,
  durableNodes: hydrated.state.nodes.map((node) => node.id),
});
