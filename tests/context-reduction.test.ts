import { afterEach, describe, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { openTestDatabase } from "../electron/main/database/test-db";
import { createThread, createWorkspace } from "../electron/main/services/workspace-service";
import { insertMessage } from "../electron/main/services/message-service";
import {
  buildConversationAwarenessContext,
  generateAwarenessEfficiencyReport,
} from "../electron/main/services/continuity-awareness-service";
import { analyzeAiLife } from "../electron/main/services/ai-life-service";
import { analyzeConversation } from "../electron/main/services/continuity-intelligence-service";

describe("context reduction", () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    while (cleanups.length) cleanups.pop()?.();
  });

  function session() {
    const opened = openTestDatabase();
    cleanups.push(opened.cleanup);
    return opened.db;
  }

  function seed(db: ReturnType<typeof session>) {
    const ws = createWorkspace(db, "Reduction WS");
    const thread = createThread(db, ws.id, "Main");
    for (let i = 0; i < 12; i += 1) {
      insertMessage(db, {
        threadId: thread.id,
        role: "user",
        content:
          i % 2 === 0
            ? `Working on ContinuityOS provider layer iteration ${i}.`
            : `We decided to prioritize provider independence milestone ${i}.`,
      });
    }
    analyzeConversation(db, ws.id);
    analyzeAiLife(db, ws.id);
    return { ws, thread };
  }

  it("reduces context size for off-topic messages by suppressing legacy memory", () => {
    const db = session();
    const { ws, thread } = seed(db);
    const offTopic = buildConversationAwarenessContext(db, {
      workspaceId: ws.id,
      threadId: thread.id,
      currentMessage: "How do I cook rice?",
      recentMessages: [],
    });
    expect(offTopic.suppressLegacyMemory).toBe(true);
    expect(offTopic.awarenessContextChars).toBeLessThan(offTopic.legacyContextChars);
  });

  it("keeps relevant continuity for on-topic messages", () => {
    const db = session();
    const { ws, thread } = seed(db);
    const onTopic = buildConversationAwarenessContext(db, {
      workspaceId: ws.id,
      threadId: thread.id,
      currentMessage: "Continue ContinuityOS provider work.",
      recentMessages: [],
    });
    expect(onTopic.aiLifeBlock ?? onTopic.continuityIntelligenceBlock).toBeTruthy();
  });

  it("generates awareness efficiency report artifact", () => {
    const db = session();
    const { ws, thread } = seed(db);
    const samples = [
      buildConversationAwarenessContext(db, {
        workspaceId: ws.id,
        threadId: thread.id,
        currentMessage: "How do I cook rice?",
        recentMessages: [],
      }),
      buildConversationAwarenessContext(db, {
        workspaceId: ws.id,
        threadId: thread.id,
        currentMessage: "Continue ContinuityOS provider work.",
        recentMessages: [],
      }),
    ].map((result, index) => ({
      label: index === 0 ? "General knowledge (cook rice)" : "Project-relevant (provider work)",
      legacyContextChars: result.legacyContextChars,
      awarenessContextChars: result.awarenessContextChars,
      contextReductionRatio: result.contextReductionRatio,
      suppressLegacyMemory: result.suppressLegacyMemory,
    }));

    const report = generateAwarenessEfficiencyReport(samples);
    writeFileSync(join(process.cwd(), "awareness-efficiency-report.md"), report, "utf8");
    expect(report).toContain("Awareness Efficiency Report");
    expect(report).toContain("General knowledge");
  });
});
