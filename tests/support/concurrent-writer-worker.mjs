import { FileEventJournal } from "../../dist/index.js";

const [rootDirectory, streamId, writerId] = process.argv.slice(2);
if (!rootDirectory || !streamId || !writerId) {
  process.stdout.write(
    `${JSON.stringify({ success: false, error: "missing worker arguments" })}\n`,
  );
  process.exitCode = 2;
} else {
  const journal = new FileEventJournal({
    rootDirectory,
    lockTimeoutMs: 15_000,
    lockRetryMs: 5,
  });
  try {
    const events = await journal.append(
      streamId,
      [
        {
          type: "concurrent.writer",
          payload: { writerId },
          schemaVersion: 1,
          occurredAt: "2026-07-31T00:00:00.000Z",
        },
      ],
      { expectedSequence: 0 },
    );
    process.stdout.write(
      `${JSON.stringify({
        success: true,
        writerId,
        sequence: events[0]?.sequence ?? null,
      })}\n`,
    );
  } catch (error) {
    process.stdout.write(
      `${JSON.stringify({
        success: false,
        writerId,
        error: error instanceof Error ? error.message : String(error),
      })}\n`,
    );
  }
}
