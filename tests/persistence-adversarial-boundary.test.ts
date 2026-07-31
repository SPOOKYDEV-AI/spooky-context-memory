import {
  mkdir,
  mkdtemp,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  FileEventJournal,
  FileSnapshotStore,
  isCanonicalUtcTimestamp,
  normalizeCanonicalJson,
} from "../src/index.js";

const roots: string[] = [];

async function root(): Promise<string> {
  const value = await mkdtemp(join(tmpdir(), "spooky-adversarial-boundary-"));
  roots.push(value);
  return value;
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((value) =>
      rm(value, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 }),
    ),
  );
});

describe("post-release adversarial persistence boundaries", () => {
  it("bounds canonical JSON depth, nodes, collections and strings", () => {
    expect(() =>
      normalizeCanonicalJson(
        { level1: { level2: { level3: true } } },
        { maxDepth: 2 },
      ),
    ).toThrow("depth limit");
    expect(() =>
      normalizeCanonicalJson([1, 2, 3], { maxArrayLength: 2 }),
    ).toThrow("array limit");
    expect(() =>
      normalizeCanonicalJson({ a: 1, b: 2 }, { maxObjectKeys: 1 }),
    ).toThrow("object-key limit");
    expect(() =>
      normalizeCanonicalJson({ a: [1, 2] }, { maxNodes: 3 }),
    ).toThrow("node limit");
    expect(() =>
      normalizeCanonicalJson("abcd", { maxStringLength: 3 }),
    ).toThrow("string limit");
  });

  it("accepts only canonical UTC millisecond timestamps", () => {
    expect(isCanonicalUtcTimestamp("2026-07-31T00:00:00.000Z")).toBe(true);
    expect(isCanonicalUtcTimestamp("2026-07-31")).toBe(false);
    expect(isCanonicalUtcTimestamp("2026-07-31T02:00:00.000+02:00")).toBe(false);
    expect(isCanonicalUtcTimestamp("2026-02-30T00:00:00.000Z")).toBe(false);
    expect(isCanonicalUtcTimestamp("2026-07-31T00:00:00Z")).toBe(false);
  });

  it("rejects ambiguous event and snapshot timestamps before persistence", async () => {
    const directory = await root();
    const journal = new FileEventJournal({ rootDirectory: directory });
    await expect(
      journal.append("atlas", [
        {
          type: "counter.added",
          payload: { amount: 1 },
          schemaVersion: 1,
          occurredAt: "2026-07-31",
        },
      ]),
    ).rejects.toThrow("supported uncommitted event envelope");
    await expect(
      journal.append(
        "atlas",
        [
          {
            type: "counter.added",
            payload: { amount: 1 },
            schemaVersion: 1,
            occurredAt: "2026-07-31T00:00:00.000Z",
          },
        ],
        { recordedAt: "2026-07-31T02:00:00.000+02:00" },
      ),
    ).rejects.toThrow("canonical UTC");

    const snapshots = new FileSnapshotStore({ rootDirectory: directory });
    await expect(
      snapshots.save({
        streamId: "atlas",
        sequence: 0,
        eventHash: "GENESIS",
        schemaVersion: 1,
        state: { value: 0 },
        createdAt: "2026-07-31T00:00:00Z",
      }),
    ).rejects.toThrow("canonical UTC");
  });

  it("bounds event batches, append bytes and journal reads", async () => {
    const directory = await root();
    const batchLimited = new FileEventJournal({
      rootDirectory: directory,
      maxEventBatchSize: 1,
    });
    await expect(
      batchLimited.append("batch", [
        {
          type: "counter.added",
          payload: { amount: 1 },
          schemaVersion: 1,
          occurredAt: "2026-07-31T00:00:00.000Z",
        },
        {
          type: "counter.added",
          payload: { amount: 2 },
          schemaVersion: 1,
          occurredAt: "2026-07-31T00:00:01.000Z",
        },
      ]),
    ).rejects.toThrow("maxEventBatchSize");

    const appendLimited = new FileEventJournal({
      rootDirectory: directory,
      maxSerializedAppendBytes: 64,
    });
    await expect(
      appendLimited.append("bytes", [
        {
          type: "large.payload",
          payload: { text: "x".repeat(256) },
          schemaVersion: 1,
          occurredAt: "2026-07-31T00:00:00.000Z",
        },
      ]),
    ).rejects.toThrow("maxSerializedAppendBytes");

    const readLimited = new FileEventJournal({
      rootDirectory: directory,
      maxJournalBytes: 32,
    });
    await mkdir(join(directory, "journals"), { recursive: true });
    await writeFile(readLimited.journalPath("oversized"), "x".repeat(33), "utf8");
    await expect(readLimited.inspect("oversized")).rejects.toThrow(
      "maxJournalBytes",
    );
  });

  it("refuses oversized lock metadata without parsing it", async () => {
    const directory = await root();
    const journal = new FileEventJournal({
      rootDirectory: directory,
      maxLockMetadataBytes: 64,
    });
    await mkdir(join(directory, "journals"), { recursive: true });
    await writeFile(journal.lockPath("atlas"), "x".repeat(65), "utf8");
    const inspection = await journal.inspectLock("atlas");
    expect(inspection.status).toBe("invalid");
    expect(inspection.reason).toContain("maxLockMetadataBytes");
  });

  it("creates private persistence artifacts on POSIX systems", async () => {
    if (process.platform === "win32") {
      return;
    }
    const directory = await root();
    const journal = new FileEventJournal({ rootDirectory: directory });
    await journal.append("atlas", [
      {
        type: "counter.added",
        payload: { amount: 1 },
        schemaVersion: 1,
        occurredAt: "2026-07-31T00:00:00.000Z",
      },
    ]);
    const snapshots = new FileSnapshotStore({ rootDirectory: directory });
    await snapshots.save({
      streamId: "atlas",
      sequence: 1,
      eventHash: (await journal.inspect("atlas")).validThroughHash,
      schemaVersion: 1,
      state: { total: 1 },
      createdAt: "2026-07-31T00:00:01.000Z",
    });

    expect((await stat(join(directory, "journals"))).mode & 0o077).toBe(0);
    expect((await stat(journal.journalPath("atlas"))).mode & 0o077).toBe(0);
    expect((await stat(join(directory, "snapshots"))).mode & 0o077).toBe(0);
    expect((await stat(snapshots.snapshotPath("atlas", 1))).mode & 0o077).toBe(0);
  });
});
