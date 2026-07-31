import {
  appendFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  truncate,
  unlink,
  writeFile,
} from "node:fs/promises";
import { spawn } from "node:child_process";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  FileEventJournal,
  ScriptedPersistenceFaultInjector,
  canonicalJsonStringify,
  type PersistenceFaultContext,
  type PersistenceFaultInjector,
  type PersistenceLockMetadata,
} from "../src/index.js";

const roots: string[] = [];

async function root(): Promise<string> {
  const value = await mkdtemp(join(tmpdir(), "spooky-lock-gauntlet-"));
  roots.push(value);
  return value;
}


interface ConcurrentWriterResult {
  success: boolean;
  writerId: string;
  sequence?: number | null;
  error?: string;
}

function runConcurrentWriter(
  directory: string,
  streamId: string,
  writerId: string,
): Promise<ConcurrentWriterResult> {
  const workerPath = fileURLToPath(
    new URL("./support/concurrent-writer-worker.mjs", import.meta.url),
  );
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [workerPath, directory, streamId, writerId],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code: number | null) => {
      if (code !== 0) {
        reject(
          new Error(
            `Concurrent writer ${writerId} exited with ${code}: ${stderr}`,
          ),
        );
        return;
      }
      try {
        resolve(JSON.parse(stdout.trim()) as ConcurrentWriterResult);
      } catch (error) {
        reject(
          new Error(
            `Concurrent writer ${writerId} returned invalid JSON: ${stdout}; ${String(error)}`,
          ),
        );
      }
    });
  });
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((value) => rm(value, { recursive: true, force: true })),
  );
});

describe("lock ownership and fault injection gauntlet", () => {
  it("never removes a live lock through orphan recovery", async () => {
    const directory = await root();
    const journal = new FileEventJournal({ rootDirectory: directory });
    const metadata: PersistenceLockMetadata = {
      formatVersion: 1,
      streamId: "atlas",
      ownerId: "live-owner",
      pid: process.pid,
      hostname: "synthetic-host",
      createdAt: "2026-07-31T00:00:00.000Z",
      heartbeatAt: "2026-07-31T00:00:00.000Z",
    };
    await mkdir(join(directory, "journals"), { recursive: true });
    await writeFile(
      journal.lockPath("atlas"),
      `${canonicalJsonStringify(metadata)}\n`,
      "utf8",
    );
    expect((await journal.inspectLock("atlas")).status).toBe("active");
    await expect(
      journal.recoverOrphanedLock("atlas", { confirm: true }),
    ).rejects.toThrow("active lock");
  });

  it("recovers a dead-owner lock only through explicit confirmation", async () => {
    const directory = await root();
    const journal = new FileEventJournal({
      rootDirectory: directory,
      staleLockMs: 0,
    });
    const metadata: PersistenceLockMetadata = {
      formatVersion: 1,
      streamId: "atlas",
      ownerId: "dead-owner",
      pid: 2_000_000_000,
      hostname: hostname(),
      createdAt: "2020-01-01T00:00:00.000Z",
      heartbeatAt: "2020-01-01T00:00:00.000Z",
    };
    await mkdir(join(directory, "journals"), { recursive: true });
    await writeFile(
      journal.lockPath("atlas"),
      `${canonicalJsonStringify(metadata)}\n`,
      "utf8",
    );
    const inspection = await journal.inspectLock("atlas");
    expect(["orphaned", "expired_unknown_owner"]).toContain(
      inspection.status,
    );
    await expect(
      journal.recoverOrphanedLock("atlas", { confirm: false }),
    ).rejects.toThrow("confirm=true");
    expect(
      (
        await journal.recoverOrphanedLock("atlas", {
          confirm: true,
          expectedOwnerId: "dead-owner",
        })
      ).recovered,
    ).toBe(true);
    expect((await journal.inspectLock("atlas")).status).toBe("absent");
  });

  it("preserves a replacement lock instead of deleting another owner's lock", async () => {
    const directory = await root();
    let lockPath = "";
    const replacement: PersistenceLockMetadata = {
      formatVersion: 1,
      streamId: "atlas",
      ownerId: "replacement-owner",
      pid: process.pid,
      hostname: "synthetic-host",
      createdAt: "2026-07-31T00:00:00.000Z",
      heartbeatAt: "2026-07-31T00:00:00.000Z",
    };
    const injector: PersistenceFaultInjector = {
      async trigger(context: PersistenceFaultContext) {
        if (context.point === "journal.after_lock" && context.path !== undefined) {
          lockPath = context.path;
          await writeFile(
            context.path,
            `${canonicalJsonStringify(replacement)}\n`,
            "utf8",
          );
        }
      },
    };
    const journal = new FileEventJournal({
      rootDirectory: directory,
      faultInjector: injector,
    });
    await expect(
      journal.append("atlas", [
        {
          type: "counter.added",
          payload: { amount: 1 },
          schemaVersion: 1,
          occurredAt: "2026-07-31T00:00:00.000Z",
        },
      ]),
    ).rejects.toThrow("ownership changed");
    const persistedLock = JSON.parse(await readFile(lockPath, "utf8")) as {
      ownerId: string;
    };
    expect(persistedLock.ownerId).toBe("replacement-owner");
    await unlink(lockPath);
  });

  it("makes a post-append crash observable without allowing a duplicate retry", async () => {
    const directory = await root();
    const crashing = new FileEventJournal({
      rootDirectory: directory,
      faultInjector: new ScriptedPersistenceFaultInjector([
        { point: "journal.after_append" },
      ]),
    });
    await expect(
      crashing.append(
        "atlas",
        [
          {
            type: "counter.added",
            payload: { amount: 1 },
            schemaVersion: 1,
            occurredAt: "2026-07-31T00:00:00.000Z",
          },
        ],
        { expectedSequence: 0 },
      ),
    ).rejects.toThrow("Injected persistence fault");

    const recoveredView = new FileEventJournal({ rootDirectory: directory });
    expect((await recoveredView.inspect("atlas")).validThroughSequence).toBe(1);
    await expect(
      recoveredView.append(
        "atlas",
        [
          {
            type: "counter.added",
            payload: { amount: 1 },
            schemaVersion: 1,
            occurredAt: "2026-07-31T00:00:00.000Z",
          },
        ],
        { expectedSequence: 0 },
      ),
    ).rejects.toThrow("Optimistic concurrency conflict");

    const raceDirectory = await root();
    const raceResults = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        runConcurrentWriter(raceDirectory, "race", `writer-${index}`),
      ),
    );
    expect(raceResults.filter((result) => result.success)).toHaveLength(1);
    expect(
      raceResults
        .filter((result) => !result.success)
        .every((result) =>
          result.error?.includes("Optimistic concurrency conflict"),
        ),
    ).toBe(true);
    expect(
      (
        await new FileEventJournal({ rootDirectory: raceDirectory }).inspect(
          "race",
        )
      ).validThroughSequence,
    ).toBe(1);
  });

  it("classifies a partial unicode tail using exact byte offsets", async () => {
    const directory = await root();
    const journal = new FileEventJournal({ rootDirectory: directory });
    await journal.append("atlas", [
      {
        type: "unicode",
        payload: { text: "mémoire-🧠" },
        schemaVersion: 1,
        occurredAt: "2026-07-31T00:00:00.000Z",
      },
    ]);
    const healthyLength = (await journal.inspect("atlas")).validByteLength;
    await appendFile(journal.journalPath("atlas"), '{"text":"🧠', "utf8");
    const inspection = await journal.inspect("atlas");
    expect(inspection.issue?.kind).toBe("parse_error");
    expect(inspection.issue?.recoverableByTrailingTruncation).toBe(true);
    expect(inspection.validByteLength).toBe(healthyLength);
    await journal.recoverTrailingCorruption("atlas");
    expect((await journal.inspect("atlas")).issue).toBeNull();

    let payloadReads = 0;
    const getterEvent = {
      type: "getter.snapshot",
      get payload() {
        payloadReads += 1;
        return { value: payloadReads };
      },
      schemaVersion: 1,
      occurredAt: "2026-07-31T00:00:01.000Z",
    };
    await journal.append("getter-stream", [getterEvent]);
    expect(payloadReads).toBe(1);
    expect((await journal.inspect("getter-stream")).issue).toBeNull();

    const unsupportedEnvelope = {
      type: "counter.added",
      payload: { amount: 1 },
      schemaVersion: 1,
      occurredAt: "2026-07-31T00:00:02.000Z",
      unexpectedAuthority: true,
    };
    await expect(
      journal.append("unsupported-envelope", [unsupportedEnvelope]),
    ).rejects.toThrow("supported uncommitted event envelope");
  });
  it("refuses symlinked journals and persistence directories", async () => {
    if (process.platform === "win32") {
      return;
    }
    const directory = await root();
    const external = await root();
    const journal = new FileEventJournal({ rootDirectory: directory });
    await mkdir(join(directory, "journals"), { recursive: true });
    const externalFile = join(external, "outside.jsonl");
    await writeFile(externalFile, "", "utf8");
    await symlink(externalFile, journal.journalPath("atlas"));
    await expect(journal.inspect("atlas")).rejects.toThrow(
      "not a regular file",
    );
    await expect(
      journal.append("atlas", [
        {
          type: "counter.added",
          payload: { amount: 1 },
          schemaVersion: 1,
          occurredAt: "2026-07-31T00:00:00.000Z",
        },
      ]),
    ).rejects.toThrow("not a regular file");

    const directoryLinkRoot = await root();
    const externalJournals = join(external, "external-journals");
    await mkdir(externalJournals, { recursive: true });
    await symlink(externalJournals, join(directoryLinkRoot, "journals"));
    await expect(
      new FileEventJournal({ rootDirectory: directoryLinkRoot }).inspect("atlas"),
    ).rejects.toThrow("not a real directory");
  });

  it("repairs a missing final record terminator before the next append", async () => {
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
    const path = journal.journalPath("atlas");
    const before = await readFile(path);
    expect(before.at(-1)).toBe(0x0a);
    await truncate(path, before.length - 1);
    const unterminated = await journal.inspect("atlas");
    expect(unterminated.issue).toBeNull();
    expect(unterminated.endsWithRecordTerminator).toBe(false);

    await journal.append("atlas", [
      {
        type: "counter.added",
        payload: { amount: 2 },
        schemaVersion: 1,
        occurredAt: "2026-07-31T00:00:01.000Z",
      },
    ]);
    const repaired = await journal.inspect("atlas");
    expect(repaired.issue).toBeNull();
    expect(repaired.validThroughSequence).toBe(2);
    expect(repaired.endsWithRecordTerminator).toBe(true);
  });

  it("treats lock metadata with extra authority fields as invalid", async () => {
    const directory = await root();
    const journal = new FileEventJournal({
      rootDirectory: directory,
      staleLockMs: 0,
    });
    await mkdir(join(directory, "journals"), { recursive: true });
    await writeFile(
      journal.lockPath("atlas"),
      `${canonicalJsonStringify({
        formatVersion: 1,
        streamId: "atlas",
        ownerId: "synthetic-owner",
        pid: process.pid,
        hostname: hostname(),
        createdAt: "2026-07-31T00:00:00.000Z",
        heartbeatAt: "2026-07-31T00:00:00.000Z",
        unexpectedAuthority: true,
      })}\n`,
      "utf8",
    );
    expect((await journal.inspectLock("atlas")).status).toBe("invalid");
  });

  it("never auto-recovers a malformed lock whose ownership is unknowable", async () => {
    const directory = await root();
    const journal = new FileEventJournal({
      rootDirectory: directory,
      staleLockMs: 0,
    });
    await mkdir(join(directory, "journals"), { recursive: true });
    await writeFile(journal.lockPath("atlas"), "{malformed", "utf8");
    expect((await journal.inspectLock("atlas")).status).toBe("invalid");
    await expect(
      journal.recoverOrphanedLock("atlas", { confirm: true }),
    ).rejects.toThrow("ownership cannot be established");
    expect(await readFile(journal.lockPath("atlas"), "utf8")).toBe(
      "{malformed",
    );
  });

  it("rejects invalid event timestamps before persistence", async () => {
    const directory = await root();
    const journal = new FileEventJournal({ rootDirectory: directory });
    await expect(
      journal.append("atlas", [
        {
          type: "counter.added",
          payload: { amount: 1 },
          schemaVersion: 1,
          occurredAt: "not-a-timestamp",
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
        { recordedAt: "not-a-timestamp" },
      ),
    ).rejects.toThrow("recording timestamp must be valid");
    expect((await journal.inspect("atlas")).validThroughSequence).toBe(0);
  });

});
