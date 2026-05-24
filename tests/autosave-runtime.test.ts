import { describe, expect, it, afterEach } from "vitest";
import { openTestDatabase } from "../electron/main/database/test-db";
import {
  createThread,
  createWorkspace,
} from "../electron/main/services/workspace-service";
import { insertMessage } from "../electron/main/services/message-service";
import {
  AUTOSAVE_MIN_INTERVAL_MS,
  getAutosaveStatus,
  maybeScheduleAutosave,
} from "../electron/main/services/autosave-scheduler";
import { listSnapshots } from "../electron/main/services/snapshot-service";

describe("autosave scheduler", () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    while (cleanups.length) cleanups.pop()?.();
  });

  function session() {
    const s = openTestDatabase();
    cleanups.push(s.cleanup);
    return s.db;
  }

  function clearAutosaveCooldown(db: ReturnType<typeof session>) {
    db.prepare(
      "DELETE FROM app_meta WHERE key IN ('autosave_last_at', 'autosave_last_workspace_id')",
    ).run();
  }

  it("creates transactional autosave snapshot on meaningful events", () => {
    const db = session();
    const ws = createWorkspace(db, "Autosave WS");
    const thread = createThread(db, ws.id, "Thread");
    clearAutosaveCooldown(db);

    const result = maybeScheduleAutosave(db, {
      workspaceId: ws.id,
      threadId: thread.id,
      eventType: "message_added",
      reason: "Test message",
    });

    expect(result.created).toBe(true);
    expect(result.snapshotId).toBeTruthy();

    const snaps = listSnapshots(db, ws.id);
    const auto = snaps.find((s) => s.isAuto);
    expect(auto).toBeTruthy();
    expect(auto?.replayHash).toMatch(/^replay-/);
  });

  it("respects cooldown and avoids duplicate burst snapshots", () => {
    const db = session();
    const ws = createWorkspace(db, "Cooldown WS");
    const thread = createThread(db, ws.id, "T");
    clearAutosaveCooldown(db);

    const first = maybeScheduleAutosave(db, {
      workspaceId: ws.id,
      threadId: thread.id,
      eventType: "assistant_response_completed",
      reason: "First",
    });
    expect(first.created).toBe(true);

    const second = maybeScheduleAutosave(db, {
      workspaceId: ws.id,
      threadId: thread.id,
      eventType: "assistant_response_completed",
      reason: "Second",
    });
    expect(second.created).toBe(false);
    expect(second.skippedReason).toBe("cooldown-active");

    const status = getAutosaveStatus(db);
    expect(status.cooldownActive).toBe(true);
    expect(status.minIntervalMs).toBe(AUTOSAVE_MIN_INTERVAL_MS);
  });

  it("skips non-meaningful timeline event types", () => {
    const db = session();
    const ws = createWorkspace(db, "Skip WS");

    const result = maybeScheduleAutosave(db, {
      workspaceId: ws.id,
      threadId: null,
      eventType: "provider_configured",
      reason: "Config",
    });

    expect(result.created).toBe(false);
    expect(result.skippedReason).toBe("not-meaningful-event");
  });

  it("does not replace manual snapshot lane", () => {
    const db = session();
    const ws = createWorkspace(db, "Manual lane");
    const thread = createThread(db, ws.id, "T");
    insertMessage(db, { threadId: thread.id, role: "user", content: "Hi" });

    const manualBefore = listSnapshots(db, ws.id).filter((s) => !s.isAuto).length;

    maybeScheduleAutosave(db, {
      workspaceId: ws.id,
      threadId: thread.id,
      eventType: "message_added",
      reason: "Autosave lane",
    });

    const manualAfter = listSnapshots(db, ws.id).filter((s) => !s.isAuto).length;
    const autoAfter = listSnapshots(db, ws.id).filter((s) => s.isAuto).length;

    expect(manualAfter).toBe(manualBefore);
    expect(autoAfter).toBeGreaterThan(0);
  });
});
