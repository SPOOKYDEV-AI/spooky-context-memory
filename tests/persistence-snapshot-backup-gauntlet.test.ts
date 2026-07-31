import {
  appendFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  FileEventJournal,
  FileSnapshotStore,
  ScriptedPersistenceFaultInjector,
  canonicalJsonStringify,
  createPersistenceBackup,
  hashPlainData,
  restorePersistenceBackup,
  verifyPersistenceBackup,
} from "../src/index.js";

const roots: string[] = [];

async function temporary(prefix: string): Promise<string> {
  const value = await mkdtemp(join(tmpdir(), prefix));
  roots.push(value);
  return value;
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((value) => rm(value, { recursive: true, force: true })),
  );
});

describe("snapshot atomicity and backup restore gauntlet", () => {
  it("removes a temporary snapshot after an injected pre-rename crash", async () => {
    const root = await temporary("spooky-snapshot-fault-");
    const snapshots = new FileSnapshotStore({
      rootDirectory: root,
      faultInjector: new ScriptedPersistenceFaultInjector([
        { point: "snapshot.after_write" },
      ]),
    });
    await expect(
      snapshots.save({
        streamId: "atlas",
        sequence: 0,
        eventHash: "GENESIS",
        schemaVersion: 1,
        state: { value: 1 },
      }),
    ).rejects.toThrow("Injected persistence fault");
    expect(await snapshots.inspect("atlas")).toEqual([]);
  });

  it("treats a snapshot sequence as immutable", async () => {
    const root = await temporary("spooky-snapshot-immutable-");
    const snapshots = new FileSnapshotStore({ rootDirectory: root });
    const first = await snapshots.save({
      streamId: "atlas",
      sequence: 0,
      eventHash: "GENESIS",
      schemaVersion: 1,
      state: { value: 1 },
      createdAt: "2026-07-31T00:00:00.000Z",
    });
    const idempotent = await snapshots.save({
      streamId: "atlas",
      sequence: 0,
      eventHash: "GENESIS",
      schemaVersion: 1,
      state: { value: 1 },
      createdAt: "2026-07-31T00:00:00.000Z",
    });
    expect(idempotent.snapshotHash).toBe(first.snapshotHash);
    await expect(
      snapshots.save({
        streamId: "atlas",
        sequence: 0,
        eventHash: "GENESIS",
        schemaVersion: 1,
        state: { value: 2 },
        createdAt: "2026-07-31T00:00:00.000Z",
      }),
    ).rejects.toThrow("immutable snapshot");

    const concurrent = await Promise.allSettled([
      snapshots.save({
        streamId: "atlas",
        sequence: 1,
        eventHash: "1".repeat(64),
        schemaVersion: 1,
        state: { winner: "left" },
        createdAt: "2026-07-31T00:00:01.000Z",
      }),
      snapshots.save({
        streamId: "atlas",
        sequence: 1,
        eventHash: "1".repeat(64),
        schemaVersion: 1,
        state: { winner: "right" },
        createdAt: "2026-07-31T00:00:01.000Z",
      }),
    ]);
    expect(concurrent.filter((result) => result.status === "fulfilled")).toHaveLength(
      1,
    );
    expect(concurrent.filter((result) => result.status === "rejected")).toHaveLength(
      1,
    );
    expect((await snapshots.inspect("atlas")).every((item) => item.valid)).toBe(
      true,
    );
  });

  it("surfaces and explicitly cleans abandoned temporary snapshots", async () => {
    const root = await temporary("spooky-snapshot-temp-");
    const snapshots = new FileSnapshotStore({ rootDirectory: root });
    const tempPath = `${snapshots.snapshotPath("atlas", 1)}.orphan.tmp`;
    await mkdir(join(root, "snapshots"), { recursive: true });
    await writeFile(tempPath, "partial", "utf8");
    expect((await snapshots.inspect("atlas"))[0]?.reason).toContain(
      "Abandoned temporary",
    );
    await expect(
      snapshots.cleanupTemporaryFiles("atlas", { confirm: false }),
    ).rejects.toThrow("confirm=true");
    expect(
      await snapshots.cleanupTemporaryFiles("atlas", {
        confirm: true,
        minimumAgeMs: 0,
      }),
    ).toHaveLength(1);
    expect(await snapshots.inspect("atlas")).toEqual([]);
  });

  it("backs up and restores journals and snapshots with equivalent hashes", async () => {
    const source = await temporary("spooky-backup-source-");
    const backup = join(await temporary("spooky-backup-parent-"), "backup");
    const target = join(await temporary("spooky-restore-parent-"), "restored");
    const journal = new FileEventJournal({ rootDirectory: source });
    const snapshots = new FileSnapshotStore({ rootDirectory: source });
    const events = await journal.append(
      "atlas",
      [1, 2, 3].map((amount) => ({
        type: "counter.added",
        payload: { amount },
        schemaVersion: 1,
        occurredAt: `2026-07-31T00:00:0${amount}.000Z`,
      })),
    );
    await snapshots.save({
      streamId: "atlas",
      sequence: 2,
      eventHash: events[1]!.eventHash,
      schemaVersion: 1,
      state: { total: 3 },
      createdAt: "2026-07-31T00:00:04.000Z",
    });
    const manifest = await createPersistenceBackup({
      sourceRootDirectory: source,
      destinationDirectory: backup,
      streamIds: ["atlas"],
      sourcePackageVersion: "0.7.0",
      createdAt: "2026-07-31T00:00:05.000Z",
    });
    expect((await verifyPersistenceBackup(backup)).valid).toBe(true);
    expect(manifest.streams[0]?.latestSequence).toBe(3);

    const restored = await restorePersistenceBackup({
      backupDirectory: backup,
      targetRootDirectory: target,
      confirm: true,
    });
    expect(restored.restored).toBe(true);
    const restoredInspection = await new FileEventJournal({
      rootDirectory: target,
    }).inspect("atlas");
    expect(restoredInspection.validThroughHash).toBe(events[2]!.eventHash);
    expect(
      (await new FileSnapshotStore({ rootDirectory: target }).inspect("atlas"))
        .every((item) => item.valid),
    ).toBe(true);
  });

  it("refuses a tampered backup before touching the restore target", async () => {
    const source = await temporary("spooky-backup-tamper-source-");
    const backup = join(await temporary("spooky-backup-tamper-parent-"), "backup");
    const target = join(await temporary("spooky-backup-tamper-target-"), "target");
    const journal = new FileEventJournal({ rootDirectory: source });
    await journal.append("atlas", [
      {
        type: "counter.added",
        payload: { amount: 1 },
        schemaVersion: 1,
        occurredAt: "2026-07-31T00:00:01.000Z",
      },
    ]);
    const manifest = await createPersistenceBackup({
      sourceRootDirectory: source,
      destinationDirectory: backup,
      streamIds: ["atlas"],
      sourcePackageVersion: "0.7.0",
    });
    const journalRecord = manifest.streams[0]?.journal;
    expect(journalRecord).not.toBeNull();
    await appendFile(join(backup, journalRecord!.relativePath), "tamper", "utf8");
    expect((await verifyPersistenceBackup(backup)).valid).toBe(false);
    await expect(
      restorePersistenceBackup({
        backupDirectory: backup,
        targetRootDirectory: target,
        confirm: true,
      }),
    ).rejects.toThrow("verification failed");
    expect(await exists(target)).toBe(false);

    await rm(backup, { recursive: true, force: true });
    const unsafeManifest = await createPersistenceBackup({
      sourceRootDirectory: source,
      destinationDirectory: backup,
      streamIds: ["atlas"],
      sourcePackageVersion: "0.7.0",
    });
    const unsafeJournal = unsafeManifest.streams[0]?.journal;
    expect(unsafeJournal).not.toBeNull();
    unsafeJournal!.relativePath = "../escape.jsonl";
    const { manifestHash: _previousHash, ...unsafeWithoutHash } = unsafeManifest;
    unsafeManifest.manifestHash = hashPlainData(unsafeWithoutHash);
    await writeFile(
      join(backup, "manifest.json"),
      `${canonicalJsonStringify(unsafeManifest)}\n`,
      "utf8",
    );
    const unsafeVerification = await verifyPersistenceBackup(backup);
    expect(unsafeVerification.valid).toBe(false);
    expect(unsafeVerification.errors.join(" ")).toContain(
      "Unsafe or unsupported backup path",
    );
    expect(await exists(join(backup, "escape.jsonl"))).toBe(false);

    if (process.platform !== "win32") {
      await rm(backup, { recursive: true, force: true });
      const symlinkManifest = await createPersistenceBackup({
        sourceRootDirectory: source,
        destinationDirectory: backup,
        streamIds: ["atlas"],
        sourcePackageVersion: "0.7.0",
      });
      const symlinkJournal = symlinkManifest.streams[0]?.journal;
      expect(symlinkJournal).not.toBeNull();
      const backedUpJournalPath = join(backup, symlinkJournal!.relativePath);
      await rm(backedUpJournalPath, { force: true });
      await symlink(journal.journalPath("atlas"), backedUpJournalPath);
      const symlinkVerification = await verifyPersistenceBackup(backup);
      expect(symlinkVerification.valid).toBe(false);
      expect(symlinkVerification.errors.join(" ")).toContain(
        "not a regular file",
      );
    }

    const unanchoredSource = await temporary("spooky-unanchored-source-");
    const unanchoredBackup = join(
      await temporary("spooky-unanchored-backup-parent-"),
      "backup",
    );
    const unanchoredJournal = new FileEventJournal({
      rootDirectory: unanchoredSource,
    });
    await unanchoredJournal.append("atlas", [
      {
        type: "counter.added",
        payload: { amount: 1 },
        schemaVersion: 1,
        occurredAt: "2026-07-31T00:00:01.000Z",
      },
    ]);
    await new FileSnapshotStore({ rootDirectory: unanchoredSource }).save({
      streamId: "atlas",
      sequence: 1,
      eventHash: "f".repeat(64),
      schemaVersion: 1,
      state: { total: 1 },
    });
    await expect(
      createPersistenceBackup({
        sourceRootDirectory: unanchoredSource,
        destinationDirectory: unanchoredBackup,
        streamIds: ["atlas"],
        sourcePackageVersion: "0.7.0",
      }),
    ).rejects.toThrow("not anchored");
  });

  it("enforces a closed-world backup tree", async () => {
    const source = await temporary("spooky-backup-closed-source-");
    const parent = await temporary("spooky-backup-closed-parent-");
    const backup = join(parent, "backup");
    await new FileEventJournal({ rootDirectory: source }).append("atlas", [
      {
        type: "counter.added",
        payload: { amount: 1 },
        schemaVersion: 1,
        occurredAt: "2026-07-31T00:00:01.000Z",
      },
    ]);
    await createPersistenceBackup({
      sourceRootDirectory: source,
      destinationDirectory: backup,
      streamIds: ["atlas"],
      sourcePackageVersion: "0.7.0",
    });

    await writeFile(join(backup, "unexpected.txt"), "not declared", "utf8");
    await mkdir(join(backup, "unexpected-directory"));
    let verification = await verifyPersistenceBackup(backup);
    expect(verification.valid).toBe(false);
    expect(verification.errors.join("\n")).toContain(
      "Backup contains unexpected file: unexpected.txt.",
    );
    expect(verification.errors.join("\n")).toContain(
      "Backup contains unexpected directory: unexpected-directory.",
    );

    await rm(join(backup, "unexpected.txt"));
    await rm(join(backup, "unexpected-directory"), { recursive: true });
    if (process.platform !== "win32") {
      await symlink(join(backup, "manifest.json"), join(backup, "unexpected-link"));
      verification = await verifyPersistenceBackup(backup);
      expect(verification.valid).toBe(false);
      expect(verification.errors.join("\n")).toContain(
        "Backup contains symbolic-link entry: unexpected-link.",
      );
    }
  });

  it("never replaces an existing target without explicit replacement", async () => {
    const source = await temporary("spooky-backup-replace-source-");
    const backup = join(await temporary("spooky-backup-replace-parent-"), "backup");
    const target = await temporary("spooky-existing-target-");
    await writeFile(join(target, "sentinel.txt"), "healthy", "utf8");
    await expect(
      createPersistenceBackup({
        sourceRootDirectory: source,
        destinationDirectory: join(source, "nested-backup"),
        streamIds: ["atlas"],
        sourcePackageVersion: "0.7.0",
      }),
    ).rejects.toThrow("must not overlap");
    await createPersistenceBackup({
      sourceRootDirectory: source,
      destinationDirectory: backup,
      streamIds: ["atlas"],
      sourcePackageVersion: "0.7.0",
    });
    await expect(
      createPersistenceBackup({
        sourceRootDirectory: source,
        destinationDirectory: backup,
        streamIds: ["atlas"],
        sourcePackageVersion: "0.7.0",
        replaceExisting: true,
      }),
    ).rejects.toThrow("confirmReplace=true");
    expect((await verifyPersistenceBackup(backup)).valid).toBe(true);
    await createPersistenceBackup({
      sourceRootDirectory: source,
      destinationDirectory: backup,
      streamIds: ["atlas"],
      sourcePackageVersion: "0.7.0",
      replaceExisting: true,
      confirmReplace: true,
    });
    expect((await verifyPersistenceBackup(backup)).valid).toBe(true);
    await expect(
      restorePersistenceBackup({
        backupDirectory: backup,
        targetRootDirectory: join(backup, "nested-target"),
        confirm: true,
      }),
    ).rejects.toThrow("must not overlap");
    await expect(
      restorePersistenceBackup({
        backupDirectory: backup,
        targetRootDirectory: target,
        confirm: true,
      }),
    ).rejects.toThrow("already exists");
    expect(await readFile(join(target, "sentinel.txt"), "utf8")).toBe(
      "healthy",
    );
  });
  it("preserves the previous backup when publication fails before replacement", async () => {
    const source = await temporary("spooky-backup-before-replace-source-");
    const parent = await temporary("spooky-backup-before-replace-parent-");
    const backup = join(parent, "backup");
    const journal = new FileEventJournal({ rootDirectory: source });
    await journal.append("atlas", [
      {
        type: "counter.added",
        payload: { amount: 1 },
        schemaVersion: 1,
        occurredAt: "2026-07-31T00:00:01.000Z",
      },
    ]);
    await createPersistenceBackup({
      sourceRootDirectory: source,
      destinationDirectory: backup,
      streamIds: ["atlas"],
      sourcePackageVersion: "0.7.0",
      createdAt: "2026-07-31T00:00:02.000Z",
    });
    await journal.append("atlas", [
      {
        type: "counter.added",
        payload: { amount: 2 },
        schemaVersion: 1,
        occurredAt: "2026-07-31T00:00:03.000Z",
      },
    ]);

    await expect(
      createPersistenceBackup({
        sourceRootDirectory: source,
        destinationDirectory: backup,
        streamIds: ["atlas"],
        sourcePackageVersion: "0.7.0",
        replaceExisting: true,
        confirmReplace: true,
        faultInjector: new ScriptedPersistenceFaultInjector([
          { point: "backup.before_replace" },
        ]),
      }),
    ).rejects.toThrow("Injected persistence fault");

    const verification = await verifyPersistenceBackup(backup);
    expect(verification.valid).toBe(true);
    expect(verification.manifest?.streams[0]?.latestSequence).toBe(1);
  });

  it("reports a post-publication backup fault without corrupting the published backup", async () => {
    const source = await temporary("spooky-backup-after-replace-source-");
    const parent = await temporary("spooky-backup-after-replace-parent-");
    const backup = join(parent, "backup");
    const journal = new FileEventJournal({ rootDirectory: source });
    await journal.append("atlas", [
      {
        type: "counter.added",
        payload: { amount: 1 },
        schemaVersion: 1,
        occurredAt: "2026-07-31T00:00:01.000Z",
      },
    ]);
    await createPersistenceBackup({
      sourceRootDirectory: source,
      destinationDirectory: backup,
      streamIds: ["atlas"],
      sourcePackageVersion: "0.7.0",
    });
    await journal.append("atlas", [
      {
        type: "counter.added",
        payload: { amount: 2 },
        schemaVersion: 1,
        occurredAt: "2026-07-31T00:00:02.000Z",
      },
    ]);

    await expect(
      createPersistenceBackup({
        sourceRootDirectory: source,
        destinationDirectory: backup,
        streamIds: ["atlas"],
        sourcePackageVersion: "0.7.0",
        replaceExisting: true,
        confirmReplace: true,
        faultInjector: new ScriptedPersistenceFaultInjector([
          { point: "backup.after_replace" },
        ]),
      }),
    ).rejects.toThrow("Injected persistence fault");

    const verification = await verifyPersistenceBackup(backup);
    expect(verification.valid).toBe(true);
    expect(verification.manifest?.streams[0]?.latestSequence).toBe(2);
  });

  it("leaves an existing restore target untouched when staged verification faults", async () => {
    const source = await temporary("spooky-restore-after-verify-source-");
    const backup = join(
      await temporary("spooky-restore-after-verify-backup-"),
      "backup",
    );
    const target = await temporary("spooky-restore-after-verify-target-");
    await writeFile(join(target, "sentinel.txt"), "original", "utf8");
    await new FileEventJournal({ rootDirectory: source }).append("atlas", [
      {
        type: "counter.added",
        payload: { amount: 1 },
        schemaVersion: 1,
        occurredAt: "2026-07-31T00:00:01.000Z",
      },
    ]);
    await createPersistenceBackup({
      sourceRootDirectory: source,
      destinationDirectory: backup,
      streamIds: ["atlas"],
      sourcePackageVersion: "0.7.0",
    });

    await expect(
      restorePersistenceBackup({
        backupDirectory: backup,
        targetRootDirectory: target,
        confirm: true,
        replaceExisting: true,
        faultInjector: new ScriptedPersistenceFaultInjector([
          { point: "restore.after_verify" },
        ]),
      }),
    ).rejects.toThrow("Injected persistence fault");
    expect(await readFile(join(target, "sentinel.txt"), "utf8")).toBe(
      "original",
    );
  });

  it("reports a post-publication restore fault while leaving a valid restored runtime", async () => {
    const source = await temporary("spooky-restore-after-replace-source-");
    const backup = join(
      await temporary("spooky-restore-after-replace-backup-"),
      "backup",
    );
    const target = await temporary("spooky-restore-after-replace-target-");
    await writeFile(join(target, "sentinel.txt"), "original", "utf8");
    const sourceJournal = new FileEventJournal({ rootDirectory: source });
    const events = await sourceJournal.append("atlas", [
      {
        type: "counter.added",
        payload: { amount: 1 },
        schemaVersion: 1,
        occurredAt: "2026-07-31T00:00:01.000Z",
      },
    ]);
    await createPersistenceBackup({
      sourceRootDirectory: source,
      destinationDirectory: backup,
      streamIds: ["atlas"],
      sourcePackageVersion: "0.7.0",
    });

    await expect(
      restorePersistenceBackup({
        backupDirectory: backup,
        targetRootDirectory: target,
        confirm: true,
        replaceExisting: true,
        faultInjector: new ScriptedPersistenceFaultInjector([
          { point: "restore.after_replace" },
        ]),
      }),
    ).rejects.toThrow("Injected persistence fault");

    expect(await exists(join(target, "sentinel.txt"))).toBe(false);
    const inspection = await new FileEventJournal({
      rootDirectory: target,
    }).inspect("atlas");
    expect(inspection.issue).toBeNull();
    expect(inspection.validThroughHash).toBe(events[0]!.eventHash);
  });

  it("removes the hidden previous-backup directory after a successful replacement", async () => {
    const source = await temporary("spooky-backup-clean-previous-source-");
    const parent = await temporary("spooky-backup-clean-previous-parent-");
    const backup = join(parent, "backup");
    const journal = new FileEventJournal({ rootDirectory: source });
    await journal.append("atlas", [
      {
        type: "counter.added",
        payload: { amount: 1 },
        schemaVersion: 1,
        occurredAt: "2026-07-31T00:00:01.000Z",
      },
    ]);
    await createPersistenceBackup({
      sourceRootDirectory: source,
      destinationDirectory: backup,
      streamIds: ["atlas"],
      sourcePackageVersion: "0.7.0",
    });
    await journal.append("atlas", [
      {
        type: "counter.added",
        payload: { amount: 2 },
        schemaVersion: 1,
        occurredAt: "2026-07-31T00:00:02.000Z",
      },
    ]);
    await createPersistenceBackup({
      sourceRootDirectory: source,
      destinationDirectory: backup,
      streamIds: ["atlas"],
      sourcePackageVersion: "0.7.0",
      replaceExisting: true,
      confirmReplace: true,
    });
    expect((await readdir(parent)).filter((name) => name.includes(".previous-"))).toEqual([]);
    expect((await verifyPersistenceBackup(backup)).manifest?.streams[0]?.latestSequence).toBe(2);
  });

  it("detects source and destination overlap through symbolic-link parents", async () => {
    if (process.platform === "win32") {
      return;
    }
    const source = await temporary("spooky-backup-realpath-source-");
    const external = await temporary("spooky-backup-realpath-links-");
    await expect(
      createPersistenceBackup({
        sourceRootDirectory: source,
        destinationDirectory: join(source, "..evil", "nested-backup"),
        streamIds: ["atlas"],
        sourcePackageVersion: "0.7.0",
      }),
    ).rejects.toThrow("must not overlap");
    const linkToSource = join(external, "source-link");
    await symlink(source, linkToSource);
    await expect(
      createPersistenceBackup({
        sourceRootDirectory: source,
        destinationDirectory: join(linkToSource, "nested-backup"),
        streamIds: ["atlas"],
        sourcePackageVersion: "0.7.0",
      }),
    ).rejects.toThrow("must not overlap");

    const backup = join(external, "backup");
    await createPersistenceBackup({
      sourceRootDirectory: source,
      destinationDirectory: backup,
      streamIds: ["atlas"],
      sourcePackageVersion: "0.7.0",
    });
    const linkToBackup = join(external, "backup-link");
    await symlink(backup, linkToBackup);
    await expect(
      restorePersistenceBackup({
        backupDirectory: backup,
        targetRootDirectory: join(linkToBackup, "nested-target"),
        confirm: true,
      }),
    ).rejects.toThrow("must not overlap");
  });

  it("refuses symlinked snapshot files and snapshot directories", async () => {
    if (process.platform === "win32") {
      return;
    }
    const rootDirectory = await temporary("spooky-snapshot-symlink-");
    const external = await temporary("spooky-snapshot-external-");
    const snapshots = new FileSnapshotStore({ rootDirectory });
    await mkdir(join(rootDirectory, "snapshots"), { recursive: true });
    const externalSnapshot = join(external, "outside.snapshot.json");
    await writeFile(externalSnapshot, "{}\n", "utf8");
    await symlink(externalSnapshot, snapshots.snapshotPath("atlas", 1));
    const inspection = await snapshots.inspect("atlas");
    expect(inspection).toHaveLength(1);
    expect(inspection[0]?.valid).toBe(false);
    expect(inspection[0]?.reason).toContain("not a regular file");
    await expect(
      snapshots.save({
        streamId: "atlas",
        sequence: 1,
        eventHash: "1".repeat(64),
        schemaVersion: 1,
        state: { total: 1 },
      }),
    ).rejects.toThrow("not a regular file");

    const linkedRoot = await temporary("spooky-snapshot-dir-link-");
    const externalDirectory = join(external, "external-snapshots");
    await mkdir(externalDirectory, { recursive: true });
    await symlink(externalDirectory, join(linkedRoot, "snapshots"));
    await expect(
      new FileSnapshotStore({ rootDirectory: linkedRoot }).save({
        streamId: "atlas",
        sequence: 0,
        eventHash: "GENESIS",
        schemaVersion: 1,
        state: { total: 0 },
      }),
    ).rejects.toThrow("not a real directory");
  });

  it("never cleans a temporary snapshot owned by a live process", async () => {
    const root = await temporary("spooky-snapshot-active-temp-");
    const snapshots = new FileSnapshotStore({ rootDirectory: root });
    const activePath = `${snapshots.snapshotPath("atlas", 2)}.${process.pid}.synthetic-owner.tmp`;
    await mkdir(join(root, "snapshots"), { recursive: true });
    await writeFile(activePath, "partial", "utf8");
    expect(
      await snapshots.cleanupTemporaryFiles("atlas", {
        confirm: true,
        minimumAgeMs: 0,
      }),
    ).toEqual([]);
    expect(await exists(activePath)).toBe(true);
  });

  it("rejects empty persistence roots and backup paths", async () => {
    expect(() => new FileSnapshotStore({ rootDirectory: "   " })).toThrow(
      "root directory cannot be empty",
    );
    const source = await temporary("spooky-empty-backup-path-source-");
    await expect(
      createPersistenceBackup({
        sourceRootDirectory: source,
        destinationDirectory: "   ",
        streamIds: ["atlas"],
        sourcePackageVersion: "0.7.0",
      }),
    ).rejects.toThrow("destination directory cannot be empty");
    await expect(
      createPersistenceBackup({
        sourceRootDirectory: source,
        destinationDirectory: join(source, "outside"),
        streamIds: ["atlas"],
        sourcePackageVersion: "   ",
      }),
    ).rejects.toThrow("Source package version cannot be empty");
    await expect(
      restorePersistenceBackup({
        backupDirectory: "   ",
        targetRootDirectory: join(source, "target"),
        confirm: true,
      }),
    ).rejects.toThrow("Backup directory cannot be empty");
  });

  it("rejects malformed snapshot event hashes before writing", async () => {
    const root = await temporary("spooky-snapshot-invalid-event-hash-");
    const snapshots = new FileSnapshotStore({ rootDirectory: root });
    await expect(
      snapshots.save({
        streamId: "atlas",
        sequence: 1,
        eventHash: "not-a-journal-hash",
        schemaVersion: 1,
        state: { total: 0 },
      }),
    ).rejects.toThrow("event hash is invalid");
    expect(await snapshots.inspect("atlas")).toEqual([]);
  });

  it("rejects invalid snapshot timestamps", async () => {
    const root = await temporary("spooky-snapshot-invalid-time-");
    const snapshots = new FileSnapshotStore({ rootDirectory: root });
    await expect(
      snapshots.save({
        streamId: "atlas",
        sequence: 0,
        eventHash: "GENESIS",
        schemaVersion: 1,
        state: { total: 0 },
        createdAt: "not-a-timestamp",
      }),
    ).rejects.toThrow("timestamp must be valid");
  });

});
