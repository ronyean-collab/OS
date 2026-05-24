import { describe, expect, it, afterEach } from "vitest";
import { openTestDatabase } from "../electron/main/database/test-db";
import {
  createThread,
  createWorkspace,
} from "../electron/main/services/workspace-service";
import {
  reconstructThreadMessages,
  validateAllThreadIds,
} from "../electron/main/services/thread-reconstruction";
import {
  appendTimelineEventValidated,
  validateTimelineEventInput,
} from "../electron/main/services/timeline-events";
import { insertOrphanMessageRow } from "./helpers/corrupt-db";

describe("thread reconstruction", () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    while (cleanups.length) cleanups.pop()?.();
  });

  function session() {
    const s = openTestDatabase();
    cleanups.push(s.cleanup);
    return s.db;
  }

  it("orders messages deterministically by created_at", () => {
    const db = session();
    const ws = createWorkspace(db, "Order WS");
    const thread = createThread(db, ws.id, "Chat");
    const t1 = "2020-01-01T00:00:00.000Z";
    const t2 = "2020-01-02T00:00:00.000Z";
    const t3 = "2020-01-03T00:00:00.000Z";

    db.prepare(
      `INSERT INTO messages (id, thread_id, role, content, created_at, message_status)
       VALUES ('m3', ?, 'assistant', 'c', ?, 'completed'),
              ('m1', ?, 'user', 'a', ?, 'completed'),
              ('m2', ?, 'user', 'b', ?, 'completed')`,
    ).run(thread.id, t3, thread.id, t1, thread.id, t2);

    const report = reconstructThreadMessages(db, thread.id);
    expect(report.messages.map((m) => m.id)).toEqual(["m1", "m2", "m3"]);
    expect(report.skipped).toBe(0);
  });

  it("skips malformed rows without breaking canonical history", () => {
    const db = session();
    const ws = createWorkspace(db, "Malformed WS");
    const thread = createThread(db, ws.id, "Chat");
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO messages (id, thread_id, role, content, created_at, message_status)
       VALUES ('good', ?, 'user', 'ok', ?, 'completed'),
              ('bad', ?, 'invalid_role', 'skip me', ?, 'completed')`,
    ).run(thread.id, now, thread.id, now);

    const report = reconstructThreadMessages(db, thread.id);
    expect(report.messages).toHaveLength(1);
    expect(report.messages[0].id).toBe("good");
    expect(report.skipped).toBe(1);
    expect(report.warnings.some((w) => w.startsWith("invalid-role"))).toBe(true);
  });

  it("detects orphaned messages across threads", () => {
    const db = session();
    insertOrphanMessageRow(db, {
      id: "orphan",
      threadId: "missing-thread",
      content: "lost",
    });

    const issues = validateAllThreadIds(db);
    expect(issues.some((i) => i.startsWith("orphaned-message"))).toBe(true);
  });

  it("rejects malformed timeline events before insert", () => {
    const db = session();
    const ws = createWorkspace(db, "Event WS");

    expect(
      validateTimelineEventInput({
        workspaceId: ws.id,
        type: "not_a_real_event" as never,
        title: "Bad",
        description: "x",
      }),
    ).toBeNull();

    const id = appendTimelineEventValidated(db, {
      workspaceId: "",
      type: "message_added",
      title: "Missing workspace",
      description: "x",
    });
    expect(id).toBeNull();
  });
});
