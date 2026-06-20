import { describe, expect, it, afterEach } from "vitest";
import { openTestDatabase } from "../electron/main/database/test-db";
import { createWorkspace, createThread } from "../electron/main/services/workspace-service";
import {
  collectRuntimeHealthInput,
  measureRuntimeHealth,
  persistRuntimeHealthSnapshot,
  getLatestRuntimeHealthSnapshot,
} from "../electron/main/services/runtime-health-service";

describe("runtime health service", () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    while (cleanups.length) cleanups.pop()?.();
  });

  function session() {
    const s = openTestDatabase();
    cleanups.push(s.cleanup);
    return s;
  }

  it("measures and persists runtime health snapshots", () => {
    const { db } = session();
    const ws = createWorkspace(db, "Health WS");
    const thread = createThread(db, ws.id, "Lane");
    const input = collectRuntimeHealthInput(db, {
      workspaceId: ws.id,
      threadId: thread.id,
      activePayloadBytes: 2048,
    });
    const health = measureRuntimeHealth(input);
    expect(health.runtimeHealthScore).toBeGreaterThan(0);
    expect(health.recoveryConfidenceScore).toBeGreaterThan(0);

    persistRuntimeHealthSnapshot(db, {
      workspaceId: ws.id,
      threadId: thread.id,
      health,
    });
    const latest = getLatestRuntimeHealthSnapshot(db, ws.id, thread.id);
    expect(latest?.runtimeHealthScore).toBe(health.runtimeHealthScore);
    expect(latest?.recoveryConfidenceScore).toBe(health.recoveryConfidenceScore);
  });
});
