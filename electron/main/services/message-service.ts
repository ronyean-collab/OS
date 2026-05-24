import { v4 as uuid } from "uuid";
import type Database from "better-sqlite3";
import type { Message, MessageRole, MessageStatus } from "../../../src/shared/types";
import { runInTransaction } from "../database/transactions";
import { reconstructThreadMessages } from "./thread-reconstruction";
import { appendTimelineEvent, enqueueSyncPlaceholder } from "./continuity-service";
import { recordSuccessfulPersistence } from "./reliability-metrics";

function mapMessage(row: Record<string, unknown>): Message {
  const status = String(row.message_status ?? "completed") as MessageStatus;
  return {
    id: String(row.id),
    threadId: String(row.thread_id),
    role: row.role as Message["role"],
    content: String(row.content),
    provider: row.provider != null ? String(row.provider) : null,
    model: row.model != null ? String(row.model) : null,
    rawProviderPayload:
      row.raw_provider_payload != null
        ? String(row.raw_provider_payload)
        : null,
    messageStatus: normalizeStatus(status),
    createdAt: String(row.created_at),
  };
}

function normalizeStatus(status: MessageStatus): MessageStatus {
  if (
    status === "streaming" ||
    status === "completed" ||
    status === "interrupted" ||
    status === "cancelled" ||
    status === "failed"
  ) {
    return status;
  }
  return "completed";
}

export function getMessageById(
  db: Database.Database,
  messageId: string,
): Message | null {
  const row = db.prepare("SELECT * FROM messages WHERE id = ?").get(messageId) as
    | Record<string, unknown>
    | undefined;
  return row ? mapMessage(row) : null;
}

export const DEFAULT_MESSAGE_PAGE_SIZE = 40;

export type MessagePageResult = {
  messages: Message[];
  totalCount: number;
  hasMoreOlder: boolean;
  oldestLoadedCreatedAt: string | null;
  oldestLoadedId: string | null;
};

export function getThreadMessageCount(
  db: Database.Database,
  threadId: string,
): number {
  const row = db
    .prepare("SELECT COUNT(*) AS c FROM messages WHERE thread_id = ?")
    .get(threadId) as { c: number };
  return row.c;
}

/**
 * Paginated load: fetches newest slice internally, returns chronological ASC for display.
 */
export function listMessagesPage(
  db: Database.Database,
  threadId: string,
  options?: {
    limit?: number;
    beforeCreatedAt?: string | null;
    beforeId?: string | null;
  },
): MessagePageResult {
  const limit = options?.limit ?? DEFAULT_MESSAGE_PAGE_SIZE;
  const totalCount = getThreadMessageCount(db, threadId);

  let rows: Record<string, unknown>[];
  if (options?.beforeCreatedAt && options?.beforeId) {
    rows = db
      .prepare(
        `SELECT * FROM messages
         WHERE thread_id = ?
           AND (created_at < ? OR (created_at = ? AND id < ?))
         ORDER BY created_at DESC, id DESC
         LIMIT ?`,
      )
      .all(
        threadId,
        options.beforeCreatedAt,
        options.beforeCreatedAt,
        options.beforeId,
        limit,
      ) as Record<string, unknown>[];
  } else {
    rows = db
      .prepare(
        `SELECT * FROM messages WHERE thread_id = ?
         ORDER BY created_at DESC, id DESC
         LIMIT ?`,
      )
      .all(threadId, limit) as Record<string, unknown>[];
  }

  const chronological = rows.reverse().map(mapMessage);
  const oldest = chronological[0];
  const hasMoreOlder =
    chronological.length > 0
      ? db
          .prepare(
            `SELECT COUNT(*) AS c FROM messages
             WHERE thread_id = ?
               AND (created_at < ? OR (created_at = ? AND id < ?))`,
          )
          .get(
            threadId,
            oldest.createdAt,
            oldest.createdAt,
            oldest.id,
          ) as { c: number }
      : { c: 0 };

  return {
    messages: chronological,
    totalCount,
    hasMoreOlder: (hasMoreOlder?.c ?? 0) > 0,
    oldestLoadedCreatedAt: oldest?.createdAt ?? null,
    oldestLoadedId: oldest?.id ?? null,
  };
}

export function listMessages(db: Database.Database, threadId: string): Message[] {
  if (getThreadMessageCount(db, threadId) <= DEFAULT_MESSAGE_PAGE_SIZE * 2) {
    return reconstructThreadMessages(db, threadId).messages;
  }
  return listMessagesPage(db, threadId, { limit: DEFAULT_MESSAGE_PAGE_SIZE * 2 })
    .messages;
}

export function setMessageStatus(
  db: Database.Database,
  messageId: string,
  status: MessageStatus,
): void {
  db.prepare("UPDATE messages SET message_status = ? WHERE id = ?").run(
    status,
    messageId,
  );
}

export function insertMessage(
  db: Database.Database,
  input: {
    threadId: string;
    role: MessageRole;
    content: string;
    provider?: string | null;
    model?: string | null;
    rawProviderPayload?: Record<string, unknown> | null;
    messageStatus?: MessageStatus;
    recordTimeline?: boolean;
    recordSnapshot?: boolean;
  },
): Message {
  const id = uuid();
  const now = new Date().toISOString();
  const rawJson = input.rawProviderPayload
    ? JSON.stringify(input.rawProviderPayload)
    : null;
  const status =
    input.messageStatus ??
    (input.role === "assistant" && input.content === "" ? "streaming" : "completed");

  return runInTransaction(db, () => {
    const ctx = assertMessageThreadContext(db, input.threadId);

    db.prepare(
      `INSERT INTO messages (id, thread_id, role, content, provider, model, raw_provider_payload, created_at, message_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      input.threadId,
      input.role,
      input.content,
      input.provider ?? null,
      input.model ?? null,
      rawJson,
      now,
      status,
    );

    db.prepare("UPDATE threads SET updated_at = ? WHERE id = ?").run(now, ctx.threadId);

    const recordTimeline = input.recordTimeline !== false;
    if (recordTimeline) {
      appendTimelineEvent(db, {
        workspaceId: ctx.workspaceId,
        threadId: ctx.threadId,
        type: "message_added",
        title: "Message added",
        description: `${input.role}: ${input.content.slice(0, 120)}`,
      });

      enqueueSyncPlaceholder(db, ctx.workspaceId, "message", id, "upsert", {
        id,
        threadId: ctx.threadId,
      });
    }

    recordSuccessfulPersistence(db);
    return mapMessage(
      db.prepare("SELECT * FROM messages WHERE id = ?").get(id) as Record<
        string,
        unknown
      >,
    );
  });
}

/** Update assistant content during streaming — no duplicate rows. */
export function updateMessageContent(
  db: Database.Database,
  messageId: string,
  content: string,
): Message {
  return runInTransaction(db, () => {
    const now = new Date().toISOString();
    db.prepare("UPDATE messages SET content = ? WHERE id = ?").run(content, messageId);
    const row = db.prepare("SELECT * FROM messages WHERE id = ?").get(messageId) as
      | Record<string, unknown>
      | undefined;
    if (row) {
      db.prepare("UPDATE threads SET updated_at = ? WHERE id = ?").run(
        now,
        String(row.thread_id),
      );
    }
    return mapMessage(row!);
  });
}

export function finalizeAssistantMessage(
  db: Database.Database,
  messageId: string,
  content: string,
  rawProviderPayload: Record<string, unknown>,
  provider: string,
  model: string,
): Message {
  return runInTransaction(db, () => {
    const now = new Date().toISOString();
    db.prepare(
      `UPDATE messages SET content = ?, provider = ?, model = ?, raw_provider_payload = ?, message_status = 'completed' WHERE id = ?`,
    ).run(
      content,
      provider,
      model,
      JSON.stringify(rawProviderPayload),
      messageId,
    );
    const row = db.prepare("SELECT * FROM messages WHERE id = ?").get(messageId) as Record<
      string,
      unknown
    >;
    db.prepare("UPDATE threads SET updated_at = ? WHERE id = ?").run(
      now,
      String(row.thread_id),
    );
    recordSuccessfulPersistence(db);
    return mapMessage(row);
  });
}

export type MessageThreadContext = {
  threadId: string;
  workspaceId: string;
};

/** Ensures thread and workspace exist and are linked before any message write. */
export function assertMessageThreadContext(
  db: Database.Database,
  threadId: string,
  expectedWorkspaceId?: string,
): MessageThreadContext {
  const normalizedThreadId = threadId.trim();
  if (!normalizedThreadId) {
    throw new Error("Cannot save message: thread id is required.");
  }

  const row = db
    .prepare(
      `SELECT t.id AS thread_id, t.workspace_id, w.id AS workspace_exists
       FROM threads t
       LEFT JOIN workspaces w ON w.id = t.workspace_id
       WHERE t.id = ?`,
    )
    .get(normalizedThreadId) as
    | { thread_id: string; workspace_id: string; workspace_exists: string | null }
    | undefined;

  if (!row?.thread_id || !row.workspace_exists) {
    throw new Error(
      "Cannot save message: thread or workspace does not exist. Select a valid thread and try again.",
    );
  }

  if (expectedWorkspaceId && row.workspace_id !== expectedWorkspaceId) {
    throw new Error(
      "Cannot save message: thread does not belong to the active workspace.",
    );
  }

  return { threadId: row.thread_id, workspaceId: row.workspace_id };
}

export function getThreadWorkspaceId(
  db: Database.Database,
  threadId: string,
): string {
  return assertMessageThreadContext(db, threadId).workspaceId;
}
