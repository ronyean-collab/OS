import { afterEach, describe, expect, it } from "vitest";
import { openTestDatabase } from "../electron/main/database/test-db";
import { createThread, createWorkspace } from "../electron/main/services/workspace-service";
import { insertMessage } from "../electron/main/services/message-service";
import {
  extractActiveProjects,
  extractCompletedProjects,
} from "../electron/main/services/ai-life-service";

describe("project tracking", () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    while (cleanups.length) cleanups.pop()?.();
  });

  function session() {
    const opened = openTestDatabase();
    cleanups.push(opened.cleanup);
    return opened.db;
  }

  it("tracks active projects with objective and status", () => {
    const db = session();
    const ws = createWorkspace(db, "Projects WS");
    const thread = createThread(db, ws.id, "Main");
    insertMessage(db, {
      threadId: thread.id,
      role: "user",
      content: "Working on ContinuityOS — major initiative for provider independence.",
    });

    const projects = extractActiveProjects(db, ws.id, thread.id);
    expect(projects.length).toBeGreaterThan(0);
    expect(projects[0].projectName.length).toBeGreaterThan(0);
    expect(projects[0].currentObjective.length).toBeGreaterThan(0);
    expect(projects[0].continuityConfidence).toBeGreaterThan(0);
    expect(["active", "paused", "completed", "archived"]).toContain(projects[0].status);
  });

  it("creates achievement records for completed projects", () => {
    const db = session();
    const ws = createWorkspace(db, "Achievements WS");
    const thread = createThread(db, ws.id, "Main");
    insertMessage(db, {
      threadId: thread.id,
      role: "user",
      content: "Completed and shipped Provider Independence for ContinuityOS.",
    });

    const achievements = extractCompletedProjects(db, ws.id, thread.id);
    expect(achievements.length).toBeGreaterThan(0);
    expect(achievements[0].achievement.length).toBeGreaterThan(0);
    expect(achievements[0].completedAt).toBeTruthy();
  });
});
