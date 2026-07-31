#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildPersistenceHealthReport } from "../evaluation/persistence-health-report.js";
import {
  createEmptyAdaptiveMemoryDurableState,
  reduceAdaptiveMemoryEvent,
  validateAdaptiveMemoryDurableState,
} from "../persistence/adaptive-memory-persistence.js";
import {
  createPersistenceBackup,
  restorePersistenceBackup,
  verifyPersistenceBackup,
} from "../persistence/backup.js";
import {
  GENESIS_EVENT_HASH,
  hashPlainData,
} from "../persistence/checksums.js";
import { FileEventJournal } from "../persistence/file-event-journal.js";
import { FileSnapshotStore } from "../persistence/file-snapshot-store.js";
import { PersistenceMigrationRegistry } from "../persistence/migrations.js";
import { verifyDeterministicReplay } from "../persistence/replay.js";

interface ParsedArguments {
  command: string;
  values: Map<string, string>;
  flags: Set<string>;
}

interface CommandArgumentSpec {
  values: ReadonlySet<string>;
  flags: ReadonlySet<string>;
}

const COMMAND_ARGUMENTS: Readonly<Record<string, CommandArgumentSpec>> = {
  help: { values: new Set(), flags: new Set(["help"]) },
  inspect: { values: new Set(["root", "stream"]), flags: new Set(["help"]) },
  verify: { values: new Set(["root", "stream"]), flags: new Set(["help"]) },
  replay: { values: new Set(["root", "stream"]), flags: new Set(["help"]) },
  health: {
    values: new Set(["root", "stream", "backup"]),
    flags: new Set(["help"]),
  },
  "verify-backup": { values: new Set(["backup"]), flags: new Set(["help"]) },
  "recover-trailing": {
    values: new Set(["root", "stream"]),
    flags: new Set(["confirm", "help"]),
  },
  "recover-lock": {
    values: new Set(["root", "stream", "owner"]),
    flags: new Set(["confirm", "help"]),
  },
  "cleanup-snapshot-temp": {
    values: new Set(["root", "stream", "minimum-age-ms"]),
    flags: new Set(["confirm", "help"]),
  },
  backup: {
    values: new Set(["root", "stream", "backup"]),
    flags: new Set(["replace", "confirm", "help"]),
  },
  restore: {
    values: new Set(["backup", "target"]),
    flags: new Set(["replace", "confirm", "help"]),
  },
};

function parseArguments(argv: string[]): ParsedArguments {
  const [command = "help", ...rest] = argv;
  const values = new Map<string, string>();
  const flags = new Set<string>();
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (token === undefined || !token.startsWith("--")) {
      throw new Error(`Unexpected argument: ${token ?? "<missing>"}`);
    }
    const key = token.slice(2);
    if (key.length === 0) {
      throw new Error("Argument name cannot be empty.");
    }
    if (values.has(key) || flags.has(key)) {
      throw new Error(`Duplicate argument: --${key}`);
    }
    const next = rest[index + 1];
    if (next !== undefined && !next.startsWith("--")) {
      values.set(key, next);
      index += 1;
    } else {
      flags.add(key);
    }
  }
  return { command, values, flags };
}

function validateArguments(arguments_: ParsedArguments): void {
  const spec = COMMAND_ARGUMENTS[arguments_.command];
  if (spec === undefined) {
    throw new Error(`Unknown command "${arguments_.command}".\n\n${usage()}`);
  }
  for (const name of arguments_.values.keys()) {
    if (!spec.values.has(name)) {
      throw new Error(`Unsupported value argument for ${arguments_.command}: --${name}`);
    }
  }
  for (const name of arguments_.flags) {
    if (!spec.flags.has(name)) {
      throw new Error(`Unsupported flag for ${arguments_.command}: --${name}`);
    }
  }
}

function optionalNonNegativeNumber(
  arguments_: ParsedArguments,
  name: string,
): number | undefined {
  const raw = arguments_.values.get(name);
  if (raw === undefined) {
    return undefined;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`--${name} must be a finite non-negative number.`);
  }
  return value;
}

async function packageVersion(): Promise<string> {
  const packageUrl = new URL("../../package.json", import.meta.url);
  const parsed: unknown = JSON.parse(await readFile(packageUrl, "utf8"));
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("version" in parsed) ||
    typeof (parsed as { version?: unknown }).version !== "string"
  ) {
    throw new Error("Package version cannot be resolved for backup metadata.");
  }
  return (parsed as { version: string }).version;
}

function required(arguments_: ParsedArguments, name: string): string {
  const value = arguments_.values.get(name);
  if (value === undefined || value.trim().length === 0) {
    throw new Error(`Missing required --${name} value.`);
  }
  return value;
}

function confirmation(arguments_: ParsedArguments): boolean {
  return arguments_.flags.has("confirm");
}

function output(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function usage(): string {
  return `spooky-memory operational CLI\n\nRead-only commands:\n  inspect --root <directory> --stream <id>\n  verify --root <directory> --stream <id>\n  replay --root <directory> --stream <id>\n  health --root <directory> --stream <id> [--backup <directory>]\n  verify-backup --backup <directory>\n\nState-changing commands:\n  recover-trailing --root <directory> --stream <id> --confirm\n  recover-lock --root <directory> --stream <id> --confirm [--owner <id>]\n  cleanup-snapshot-temp --root <directory> --stream <id> --confirm [--minimum-age-ms <ms>]\n  backup --root <directory> --stream <id> --backup <directory> [--replace --confirm]\n  restore --backup <directory> --target <directory> --confirm [--replace]\n`;
}

async function adaptiveReplay(root: string, streamId: string) {
  const journal = new FileEventJournal({ rootDirectory: root });
  const snapshots = new FileSnapshotStore({ rootDirectory: root });
  const migrations = new PersistenceMigrationRegistry();
  return verifyDeterministicReplay({
    streamId,
    journal,
    snapshots,
    targetSchemaVersion: 1,
    initialState: createEmptyAdaptiveMemoryDurableState(),
    reducer: reduceAdaptiveMemoryEvent,
    migrateEvent: (event, targetVersion) =>
      migrations.projectEvent(event, targetVersion),
    migrateSnapshot: (snapshot, targetVersion) =>
      migrations.projectSnapshot(snapshot, targetVersion),
    validateState: validateAdaptiveMemoryDurableState,
  });
}

async function main(): Promise<void> {
  const arguments_ = parseArguments(process.argv.slice(2));
  validateArguments(arguments_);
  if (arguments_.command === "help" || arguments_.flags.has("help")) {
    process.stdout.write(usage());
    return;
  }

  if (arguments_.command === "verify-backup") {
    output(await verifyPersistenceBackup(resolve(required(arguments_, "backup"))));
    return;
  }

  if (arguments_.command === "restore") {
    output(
      await restorePersistenceBackup({
        backupDirectory: resolve(required(arguments_, "backup")),
        targetRootDirectory: resolve(required(arguments_, "target")),
        confirm: confirmation(arguments_),
        replaceExisting: arguments_.flags.has("replace"),
      }),
    );
    return;
  }

  const root = resolve(required(arguments_, "root"));
  const streamId = required(arguments_, "stream");
  const journal = new FileEventJournal({ rootDirectory: root });
  const snapshots = new FileSnapshotStore({ rootDirectory: root });

  switch (arguments_.command) {
    case "inspect":
      output({
        journal: await journal.inspect(streamId),
        snapshots: await snapshots.inspect(streamId),
        lock: await journal.inspectLock(streamId),
      });
      return;
    case "verify": {
      const inspection = await journal.inspect(streamId);
      const snapshotInspections = await snapshots.inspect(streamId);
      const validSnapshots = await snapshots.list(streamId);
      const snapshotAnchorErrors = validSnapshots.flatMap((snapshot) => {
        const expectedAnchor =
          snapshot.sequence === 0
            ? GENESIS_EVENT_HASH
            : inspection.events.find(
                (event) => event.sequence === snapshot.sequence,
              )?.eventHash;
        return expectedAnchor === snapshot.eventHash
          ? []
          : [`Snapshot ${snapshot.snapshotId} is not anchored to its journal sequence.`];
      });
      output({
        valid:
          inspection.issue === null &&
          snapshotInspections.every((snapshot) => snapshot.valid) &&
          snapshotAnchorErrors.length === 0,
        inspection,
        snapshotInspections,
        snapshotAnchorErrors,
      });
      return;
    }
    case "replay": {
      const verification = await adaptiveReplay(root, streamId);
      output({
        deterministic: verification.deterministic,
        reason: verification.reason,
        finalSequence: verification.first.finalSequence,
        finalEventHash: verification.first.finalEventHash,
        stateHash: verification.first.stateHash,
        state: verification.first.state,
      });
      return;
    }
    case "health": {
      const inspection = await journal.inspect(streamId);
      const validSnapshots = await snapshots.list(streamId);
      const snapshotInspections = await snapshots.inspect(streamId);
      const lock = await journal.inspectLock(streamId);
      let deterministicReplay: boolean | undefined;
      let replay;
      try {
        const verification = await adaptiveReplay(root, streamId);
        deterministicReplay = verification.deterministic;
        replay = verification.first;
      } catch (error) {
        deterministicReplay = false;
        process.stderr.write(
          `Replay verification failed: ${error instanceof Error ? error.message : String(error)}\n`,
        );
      }
      let backupCreatedAt: string | undefined;
      let backupVerified: boolean | undefined;
      const backupDirectory = arguments_.values.get("backup");
      if (backupDirectory !== undefined) {
        const verification = await verifyPersistenceBackup(
          resolve(backupDirectory),
        );
        backupVerified = verification.valid;
        if (verification.valid && verification.manifest !== null) {
          backupCreatedAt = verification.manifest.createdAt;
        }
      }
      output(
        buildPersistenceHealthReport({
          inspection,
          snapshots: validSnapshots,
          snapshotInspections,
          lock,
          ...(replay === undefined ? {} : { replay }),
          ...(deterministicReplay === undefined
            ? {}
            : { deterministicReplay }),
          ...(backupVerified === undefined ? {} : { backupVerified }),
          ...(backupCreatedAt === undefined ? {} : { backupCreatedAt }),
        }),
      );
      return;
    }
    case "recover-trailing":
      if (!confirmation(arguments_)) {
        throw new Error("recover-trailing requires --confirm.");
      }
      output(await journal.recoverTrailingCorruption(streamId));
      return;
    case "recover-lock":
      output(
        await journal.recoverOrphanedLock(streamId, {
          confirm: confirmation(arguments_),
          ...(arguments_.values.get("owner") === undefined
            ? {}
            : { expectedOwnerId: arguments_.values.get("owner")! }),
        }),
      );
      return;
    case "cleanup-snapshot-temp":
      if (!confirmation(arguments_)) {
        throw new Error("cleanup-snapshot-temp requires --confirm.");
      }
      const minimumAgeMs = optionalNonNegativeNumber(
        arguments_,
        "minimum-age-ms",
      );
      output({
        deleted: await snapshots.cleanupTemporaryFiles(streamId, {
          confirm: true,
          ...(minimumAgeMs === undefined ? {} : { minimumAgeMs }),
        }),
      });
      return;
    case "backup": {
      const manifest = await createPersistenceBackup({
        sourceRootDirectory: root,
        destinationDirectory: resolve(required(arguments_, "backup")),
        streamIds: [streamId],
        sourcePackageVersion: await packageVersion(),
        replaceExisting: arguments_.flags.has("replace"),
        confirmReplace: confirmation(arguments_),
      });
      output({
        manifest,
        manifestStateHash: hashPlainData(manifest),
      });
      return;
    }
    default:
      throw new Error(`Unknown command "${arguments_.command}".\n\n${usage()}`);
  }
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.stack ?? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
