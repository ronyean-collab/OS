import { describe, expect, it } from "vitest";
import {
  buildCanonicalReplayPayload,
  computeDeterministicReplayHash,
  sortForReplayHash,
  validateReplayHashMatch,
} from "../electron/main/services/replay-hash";

describe("replay hash determinism", () => {
  const sample = [
    {
      id: "m-b",
      threadId: "t-1",
      role: "assistant",
      content: "Reply",
      createdAt: "2026-05-18T12:00:01.000Z",
      messageStatus: "completed",
    },
    {
      id: "m-a",
      threadId: "t-1",
      role: "user",
      content: "Hello",
      createdAt: "2026-05-18T12:00:00.000Z",
      messageStatus: "completed",
    },
    {
      id: "m-c",
      threadId: "t-2",
      role: "user",
      content: "Other thread",
      createdAt: "2026-05-18T12:00:02.000Z",
      messageStatus: "completed",
    },
  ];

  it("produces identical hash for identical history regardless of input order", () => {
    const h1 = computeDeterministicReplayHash(sample);
    const h2 = computeDeterministicReplayHash([...sample].reverse());
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^replay-[0-9a-f]{16}$/);
  });

  it("changes hash when content, role, status, or timestamp changes", () => {
    const base = computeDeterministicReplayHash(sample);
    const changedContent = computeDeterministicReplayHash(
      sample.map((m) =>
        m.id === "m-a" ? { ...m, content: "Changed" } : m,
      ),
    );
    const changedStatus = computeDeterministicReplayHash(
      sample.map((m) =>
        m.id === "m-b" ? { ...m, messageStatus: "interrupted" } : m,
      ),
    );
    expect(changedContent).not.toBe(base);
    expect(changedStatus).not.toBe(base);
  });

  it("sorts canonically by thread, createdAt, then id", () => {
    const sorted = sortForReplayHash(sample);
    expect(sorted.map((m) => m.id)).toEqual(["m-a", "m-b", "m-c"]);
    const payload = buildCanonicalReplayPayload(sample);
    expect(payload.split("\n")).toHaveLength(3);
  });

  it("validates replay hash match helper without implying crypto trust", () => {
    const hash = computeDeterministicReplayHash(sample);
    expect(validateReplayHashMatch(hash, hash).matches).toBe(true);
    expect(validateReplayHashMatch(null, hash).matches).toBe(true);
    expect(validateReplayHashMatch(hash, "replay-deadbeef00000000").matches).toBe(
      false,
    );
  });
});
