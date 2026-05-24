import type Database from "better-sqlite3";
import { runInTransaction } from "../database/transactions";
import {
  appendTimelineEventValidated,
  hasTimelineEventForMessage,
} from "./timeline-events";

export type StreamRecoveryResult = {
  recoveredCount: number;
  messageIds: string[];
};

/** Finalize messages left in `streaming` after crash — preserve content, mark interrupted. */
export function recoverInterruptedStreams(
  db: Database.Database,
): StreamRecoveryResult {
  const streaming = db
    .prepare(
      `SELECT m.id, m.thread_id, m.content, t.workspace_id
       FROM messages m
       JOIN threads t ON t.id = m.thread_id
       WHERE m.role = 'assistant' AND m.message_status = 'streaming'`,
    )
    .all() as Array<{
    id: string;
    thread_id: string;
    content: string;
    workspace_id: string;
  }>;

  const messageIds: string[] = [];

  for (const row of streaming) {
    runInTransaction(db, () => {
      db.prepare(
        `UPDATE messages SET message_status = 'interrupted' WHERE id = ? AND message_status = 'streaming'`,
      ).run(row.id);

      if (
        !hasTimelineEventForMessage(
          db,
          row.workspace_id,
          row.thread_id,
          row.id,
          "assistant_response_interrupted",
        )
      ) {
        appendTimelineEventValidated(db, {
          workspaceId: row.workspace_id,
          threadId: row.thread_id,
          type: "assistant_response_interrupted",
          title: "Response interrupted",
          description: `Assistant response ${row.id} was interrupted; partial content preserved.`,
          source: "recovery",
        });
      }
    });
    messageIds.push(row.id);
  }

  return { recoveredCount: messageIds.length, messageIds };
}

/** Graceful shutdown: mark in-flight streams interrupted (partial preserved). */
export function markStreamingMessagesInterrupted(
  db: Database.Database,
): number {
  const result = db
    .prepare(
      `UPDATE messages SET message_status = 'interrupted'
       WHERE role = 'assistant' AND message_status = 'streaming'`,
    )
    .run();
  return result.changes;
}
