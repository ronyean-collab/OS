import type { Message } from "../../../src/shared/types";
import type { CheckpointMessage } from "./snapshot-checkpoint";

export type ReplayHashMessage = {
  id: string;
  threadId: string;
  role: string;
  content: string;
  createdAt: string;
  messageStatus: string;
};

/** FNV-1a 64-bit — deterministic, not a security guarantee. */
export function fnv1a64Hex(input: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (let i = 0; i < input.length; i++) {
    hash ^= BigInt(input.charCodeAt(i));
    hash = BigInt.asUintN(64, hash * prime);
  }
  return hash.toString(16).padStart(16, "0");
}

export function sortForReplayHash<T extends ReplayHashMessage>(messages: T[]): T[] {
  return [...messages].sort((a, b) => {
    const t = a.threadId.localeCompare(b.threadId);
    if (t !== 0) return t;
    const c = a.createdAt.localeCompare(b.createdAt);
    if (c !== 0) return c;
    return a.id.localeCompare(b.id);
  });
}

export function buildCanonicalReplayPayload(messages: ReplayHashMessage[]): string {
  const sorted = sortForReplayHash(messages);
  return sorted
    .map(
      (m) =>
        `${m.threadId}\t${m.id}\t${m.role}\t${m.createdAt}\t${m.messageStatus}\t${m.content}`,
    )
    .join("\n");
}

/** Identical canonical history produces identical replay hash. */
export function computeDeterministicReplayHash(
  messages: ReplayHashMessage[],
): string {
  const payload = buildCanonicalReplayPayload(messages);
  return `replay-${fnv1a64Hex(payload)}`;
}

export function messagesToReplayHashInput(messages: Message[]): ReplayHashMessage[] {
  return messages.map((m) => ({
    id: m.id,
    threadId: m.threadId,
    role: m.role,
    content: m.content,
    createdAt: m.createdAt,
    messageStatus: m.messageStatus,
  }));
}

export function checkpointMessagesToReplayHashInput(
  messages: CheckpointMessage[],
): ReplayHashMessage[] {
  return messages.map((m) => ({
    id: m.id,
    threadId: m.threadId,
    role: m.role,
    content: m.content,
    createdAt: m.createdAt,
    messageStatus: m.messageStatus,
  }));
}

export function validateReplayHashMatch(
  expected: string | null | undefined,
  actual: string,
): { matches: boolean; expected: string | null; actual: string } {
  if (!expected) {
    return { matches: true, expected: null, actual };
  }
  return {
    matches: expected === actual,
    expected,
    actual,
  };
}

/** @deprecated Use computeDeterministicReplayHash — kept for transitional callers. */
export function computeReplayHashPlaceholder(parts: string[]): string {
  return computeDeterministicReplayHash(
    parts.map((p, i) => ({
      id: `part-${i}`,
      threadId: "legacy",
      role: "system",
      content: p,
      createdAt: "1970-01-01T00:00:00.000Z",
      messageStatus: "completed",
    })),
  );
}
