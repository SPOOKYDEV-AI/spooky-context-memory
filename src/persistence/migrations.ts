import { clonePlainData } from "../utils/clone-plain-data.js";
import { normalizeCanonicalJson } from "./canonical-json.js";
import type {
  EventMigration,
  MemorySnapshot,
  PersistedMemoryEvent,
  ProjectedMemoryEvent,
  ProjectedSnapshot,
  SnapshotMigration,
} from "./types.js";

function assertVersion(version: number, label: string): void {
  if (!Number.isInteger(version) || version < 1) {
    throw new Error(`${label} must be a positive integer.`);
  }
}

function migrationKey(fromVersion: number): string {
  return String(fromVersion);
}

export class PersistenceMigrationRegistry {
  private readonly eventMigrations = new Map<string, EventMigration>();
  private readonly snapshotMigrations = new Map<string, SnapshotMigration>();

  public registerEventMigration(migration: EventMigration): void {
    this.assertMigration(migration.fromVersion, migration.toVersion, "event");
    const key = migrationKey(migration.fromVersion);
    if (this.eventMigrations.has(key)) {
      throw new Error(
        `An event migration from schema ${migration.fromVersion} is already registered.`,
      );
    }
    this.eventMigrations.set(key, migration);
  }

  public registerSnapshotMigration(migration: SnapshotMigration): void {
    this.assertMigration(migration.fromVersion, migration.toVersion, "snapshot");
    const key = migrationKey(migration.fromVersion);
    if (this.snapshotMigrations.has(key)) {
      throw new Error(
        `A snapshot migration from schema ${migration.fromVersion} is already registered.`,
      );
    }
    this.snapshotMigrations.set(key, migration);
  }

  public projectEvent(
    event: PersistedMemoryEvent,
    targetVersion: number,
  ): ProjectedMemoryEvent {
    assertVersion(targetVersion, "Target schema version");
    let schemaVersion = event.schemaVersion;
    let payload = clonePlainData(event.payload);
    while (schemaVersion < targetVersion) {
      const migration = this.eventMigrations.get(migrationKey(schemaVersion));
      if (migration === undefined) {
        throw new Error(
          `Missing event migration from schema ${schemaVersion} to ${targetVersion}.`,
        );
      }
      payload = normalizeCanonicalJson(
        migration.migrate(clonePlainData(payload)),
      );
      schemaVersion = migration.toVersion;
    }
    if (schemaVersion !== targetVersion) {
      throw new Error(
        `Event schema ${event.schemaVersion} cannot be projected to ${targetVersion}.`,
      );
    }
    return {
      source: clonePlainData(event),
      schemaVersion,
      payload: clonePlainData(payload),
    };
  }

  public projectSnapshot<TState>(
    snapshot: MemorySnapshot,
    targetVersion: number,
  ): ProjectedSnapshot<TState> {
    assertVersion(targetVersion, "Target schema version");
    let schemaVersion = snapshot.schemaVersion;
    let state = clonePlainData(snapshot.state);
    while (schemaVersion < targetVersion) {
      const migration = this.snapshotMigrations.get(migrationKey(schemaVersion));
      if (migration === undefined) {
        throw new Error(
          `Missing snapshot migration from schema ${schemaVersion} to ${targetVersion}.`,
        );
      }
      state = normalizeCanonicalJson(
        migration.migrate(clonePlainData(state)),
      );
      schemaVersion = migration.toVersion;
    }
    if (schemaVersion !== targetVersion) {
      throw new Error(
        `Snapshot schema ${snapshot.schemaVersion} cannot be projected to ${targetVersion}.`,
      );
    }
    return {
      source: clonePlainData(snapshot),
      schemaVersion,
      state: clonePlainData(state) as TState,
    };
  }

  private assertMigration(
    fromVersion: number,
    toVersion: number,
    label: string,
  ): void {
    assertVersion(fromVersion, `${label} migration source version`);
    assertVersion(toVersion, `${label} migration target version`);
    if (toVersion !== fromVersion + 1) {
      throw new Error(
        `${label} migrations must advance exactly one schema version at a time.`,
      );
    }
  }
}
