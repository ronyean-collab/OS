import { afterEach, describe, expect, it } from "vitest";
import { openTestDatabase } from "../electron/main/database/test-db";
import { createThread, createWorkspace } from "../electron/main/services/workspace-service";
import { insertMessage } from "../electron/main/services/message-service";
import {
  buildConversationAwarenessContext,
  determineRelevantProjects,
} from "../electron/main/services/continuity-awareness-service";
import { analyzeAiLife, extractLongTermGoals } from "../electron/main/services/ai-life-service";

describe("project awareness", () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    while (cleanups.length) cleanups.pop()?.();
  });

  function session() {
    const opened = openTestDatabase();
    cleanups.push(opened.cleanup);
    return opened.db;
  }

  it("prioritizes ContinuityOS when user discusses ContinuityOS", () => {
    const db = session();
    const ws = createWorkspace(db, "ContinuityOS");
    const thread = createThread(db, ws.id, "Main");
    insertMessage(db, {
      threadId: thread.id,
      role: "user",
      content: "Working on ContinuityOS provider independence layer.",
    });
    insertMessage(db, {
      threadId: thread.id,
      role: "user",
      content: "Building CS2Coach coaching workflows on the side.",
    });
    analyzeAiLife(db, ws.id);

    const goals = extractLongTermGoals(db, ws.id, thread.id);
    const relevant = determineRelevantProjects(
      db,
      ws.id,
      thread.id,
      "What is the current status of ContinuityOS provider work?",
      goals,
    );
    expect(relevant.length).toBeGreaterThan(0);
    expect(relevant.some((entry) => /continuity/i.test(entry.item.projectName))).toBe(true);
    expect(relevant.some((entry) => /cs2coach/i.test(entry.item.projectName))).toBe(false);
  });

  it("does not surface unrelated projects for off-topic queries", () => {
    const db = session();
    const ws = createWorkspace(db, "ContinuityOS");
    const thread = createThread(db, ws.id, "Main");
    insertMessage(db, {
      threadId: thread.id,
      role: "user",
      content: "Working on ContinuityOS and CS2Coach initiatives.",
    });
    analyzeAiLife(db, ws.id);

    const result = buildConversationAwarenessContext(db, {
      workspaceId: ws.id,
      threadId: thread.id,
      currentMessage: "How do I cook rice for dinner?",
      recentMessages: [],
    });
    expect(result.relevantProjects).toHaveLength(0);
  });
});
