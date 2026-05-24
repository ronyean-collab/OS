import type Database from "better-sqlite3";

function readForeignKeysOn(db: Database.Database): boolean {
  const row = db.pragma("foreign_keys", { simple: true }) as number | boolean;
  return row === 1 || row === true;
}

/**
 * Test-only: inserts rows that violate FK constraints (simulates historical corruption).
 * Production connections must never call this — FK stay ON in app runtime.
 */
export function withForeignKeysTemporarilyDisabled<T>(
  db: Database.Database,
  fn: () => T,
): T {
  const previousOn = readForeignKeysOn(db);
  db.pragma("foreign_keys = OFF");
  try {
    return fn();
  } finally {
    db.pragma("foreign_keys = ON");
    if (!readForeignKeysOn(db)) {
      throw new Error("foreign_keys were not restored to ON after corruption helper");
    }
    if (previousOn && !readForeignKeysOn(db)) {
      throw new Error("foreign_keys state mismatch after corruption helper");
    }
  }
}

/** Inserts a message row with an arbitrary thread_id (may not exist). */
export function insertOrphanMessageRow(
  db: Database.Database,
  input: {
    id: string;
    threadId: string;
    content?: string;
    role?: string;
  },
): void {
  withForeignKeysTemporarilyDisabled(db, () => {
    db.prepare(
      `INSERT INTO messages (id, thread_id, role, content, provider, model, raw_provider_payload, created_at, message_status)
       VALUES (?, ?, ?, ?, NULL, NULL, NULL, ?, 'completed')`,
    ).run(
      input.id,
      input.threadId,
      input.role ?? "user",
      input.content ?? "orphan",
      new Date().toISOString(),
    );
  });
  if (!readForeignKeysOn(db)) {
    throw new Error("foreign_keys must remain ON after insertOrphanMessageRow");
  }
}
