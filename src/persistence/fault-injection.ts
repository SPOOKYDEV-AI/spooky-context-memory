export type PersistenceFaultPoint =
  | "journal.before_lock"
  | "journal.after_lock"
  | "journal.before_inspect"
  | "journal.after_prepare"
  | "journal.before_append"
  | "journal.after_append"
  | "journal.before_fsync"
  | "journal.after_fsync"
  | "journal.before_unlock"
  | "journal.after_unlock"
  | "snapshot.before_write"
  | "snapshot.after_write"
  | "snapshot.before_fsync"
  | "snapshot.after_fsync"
  | "snapshot.before_rename"
  | "snapshot.after_rename"
  | "backup.before_copy"
  | "backup.after_copy"
  | "backup.before_manifest"
  | "backup.after_manifest"
  | "backup.before_replace"
  | "backup.after_replace"
  | "restore.before_verify"
  | "restore.after_copy"
  | "restore.after_verify"
  | "restore.before_replace"
  | "restore.after_replace";

export interface PersistenceFaultContext {
  point: PersistenceFaultPoint;
  streamId?: string;
  path?: string;
  sequence?: number;
  eventCount?: number;
  metadata?: Record<string, unknown>;
}

export interface PersistenceFaultInjector {
  trigger(context: PersistenceFaultContext): void | Promise<void>;
}

export class NoopPersistenceFaultInjector implements PersistenceFaultInjector {
  public trigger(_context: PersistenceFaultContext): void {
    // Intentionally empty.
  }
}

export interface ScriptedFault {
  point: PersistenceFaultPoint;
  occurrence?: number;
  error?: Error;
}

/**
 * Deterministic test helper. It throws only at configured fault points and
 * occurrences, making every injected crash reproducible.
 */
export class ScriptedPersistenceFaultInjector
  implements PersistenceFaultInjector
{
  private readonly faults: ScriptedFault[];
  private readonly counts = new Map<PersistenceFaultPoint, number>();

  public constructor(faults: ReadonlyArray<ScriptedFault>) {
    this.faults = faults.map((fault) => ({ ...fault }));
  }

  public trigger(context: PersistenceFaultContext): void {
    const occurrence = (this.counts.get(context.point) ?? 0) + 1;
    this.counts.set(context.point, occurrence);
    const fault = this.faults.find(
      (candidate) =>
        candidate.point === context.point &&
        (candidate.occurrence ?? 1) === occurrence,
    );
    if (fault !== undefined) {
      throw (
        fault.error ??
        new Error(
          `Injected persistence fault at ${context.point} occurrence ${occurrence}.`,
        )
      );
    }
  }
}
