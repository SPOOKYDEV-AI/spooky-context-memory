import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  FileEventJournal,
  canonicalJsonStringify,
  hashPlainData,
} from "../src/index.js";

const roots: string[] = [];

async function fixture(): Promise<{
  root: string;
  journal: FileEventJournal;
  path: string;
  lines: Array<Record<string, unknown>>;
}> {
  const root = await mkdtemp(join(tmpdir(), "spooky-mutation-gauntlet-"));
  roots.push(root);
  const journal = new FileEventJournal({ rootDirectory: root });
  await journal.append(
    "atlas",
    [1, 2, 3].map((value) => ({
      type: "counter.added",
      payload: { value },
      schemaVersion: 1,
      occurredAt: `2026-07-31T00:00:0${value}.000Z`,
    })),
  );
  const path = journal.journalPath("atlas");
  const lines = (await readFile(path, "utf8"))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as Record<string, unknown>);
  return { root, journal, path, lines };
}

function serialize(lines: Array<Record<string, unknown>>): string {
  return `${lines.map((line) => canonicalJsonStringify(line)).join("\n")}\n`;
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("journal mutation resistance gauntlet", () => {
  const mutations: Array<{
    name: string;
    mutate(lines: Array<Record<string, unknown>>): void;
    expectedKind: string;
  }> = [
    {
      name: "payload mutation",
      mutate(lines) {
        lines[1]!.payload = { value: 200 };
      },
      expectedKind: "payload_hash_mismatch",
    },
    {
      name: "event identity mutation",
      mutate(lines) {
        lines[1]!.eventId = `evt_${"0".repeat(32)}`;
        const { eventHash: _previousHash, ...withoutHash } = lines[1]!;
        lines[1]!.eventHash = hashPlainData(withoutHash);
      },
      expectedKind: "unsupported_record",
    },
    {
      name: "event hash mutation",
      mutate(lines) {
        lines[1]!.eventHash = "0".repeat(64);
      },
      expectedKind: "event_hash_mismatch",
    },
    {
      name: "previous hash mutation",
      mutate(lines) {
        lines[1]!.previousHash = "1".repeat(64);
      },
      expectedKind: "previous_hash_mismatch",
    },
    {
      name: "sequence mutation",
      mutate(lines) {
        lines[1]!.sequence = 99;
      },
      expectedKind: "sequence_gap",
    },
    {
      name: "stream mixing",
      mutate(lines) {
        lines[1]!.streamId = "other-stream";
      },
      expectedKind: "stream_mismatch",
    },
    {
      name: "event type mutation",
      mutate(lines) {
        lines[1]!.type = "counter.removed";
      },
      expectedKind: "event_hash_mismatch",
    },
    {
      name: "required envelope field removal",
      mutate(lines) {
        delete lines[1]!.payloadHash;
      },
      expectedKind: "unsupported_record",
    },
  ];

  for (const mutation of mutations) {
    it(`detects ${mutation.name} and refuses destructive recovery`, async () => {
      const { journal, path, lines } = await fixture();
      mutation.mutate(lines);
      await writeFile(path, serialize(lines), "utf8");
      const inspection = await journal.inspect("atlas");
      expect(inspection.issue?.kind).toBe(mutation.expectedKind);
      expect(inspection.issue?.recoverableByTrailingTruncation).toBe(false);
      await expect(journal.recoverTrailingCorruption("atlas")).rejects.toThrow(
        "non-trailing corruption",
      );
    });
  }

  it("detects reordered records", async () => {
    const { journal, path, lines } = await fixture();
    [lines[0], lines[1]] = [lines[1]!, lines[0]!];
    await writeFile(path, serialize(lines), "utf8");
    expect((await journal.inspect("atlas")).issue?.kind).toBe("sequence_gap");
  });

  it("detects a deleted middle record", async () => {
    const { journal, path, lines } = await fixture();
    lines.splice(1, 1);
    await writeFile(path, serialize(lines), "utf8");
    expect((await journal.inspect("atlas")).issue?.kind).toBe("sequence_gap");
  });

  it("detects a duplicated record", async () => {
    const { journal, path, lines } = await fixture();
    lines.splice(1, 0, { ...lines[0]! });
    await writeFile(path, serialize(lines), "utf8");
    expect((await journal.inspect("atlas")).issue?.kind).toBe("sequence_gap");
  });
});
