import { FileEventJournal } from "../../dist/index.js";

function serializeError(error) {
  const messages = [];
  const codes = [];
  const seen = new Set();

  function visit(value) {
    if (value !== null && typeof value === "object") {
      if (seen.has(value)) {
        return;
      }
      seen.add(value);
    }

    if (value instanceof Error) {
      messages.push(value.message);
      if ("code" in value && typeof value.code === "string") {
        codes.push(value.code);
      }
      if (value instanceof AggregateError) {
        for (const nested of value.errors) {
          visit(nested);
        }
      }
      if ("cause" in value && value.cause !== undefined) {
        visit(value.cause);
      }
      return;
    }

    messages.push(String(value));
  }

  visit(error);
  return {
    error: messages.join(" | "),
    errorName: error instanceof Error ? error.name : typeof error,
    errorMessages: [...new Set(messages)],
    errorCodes: [...new Set(codes)],
  };
}

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
        ...serializeError(error),
      })}\n`,
    );
  }
}
