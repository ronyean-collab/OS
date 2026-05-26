import { describe, expect, it } from "vitest";
import {
  createChatWorkflowSession,
  getChatWorkflowDefinition,
  getContextPackRequestHint,
  routeChatIntent,
  summarizeImportPreview,
} from "../src/renderer/src/chat-workflows";

describe("chat workflows", () => {
  it("routes import memory intent into the import workflow", () => {
    expect(routeChatIntent("import memory")).toEqual({
      kind: "workflow",
      workflow: "import_memory",
    });
    expect(routeChatIntent("paste memory from another chat")).toEqual({
      kind: "workflow",
      workflow: "import_memory",
    });
  });

  it("routes backup, context pack, memory review, local ai, paste response, and memory update intents", () => {
    expect(routeChatIntent("backup my workspace")).toEqual({
      kind: "workflow",
      workflow: "backup_export",
    });
    expect(routeChatIntent("continue in any ai")).toEqual({
      kind: "workflow",
      workflow: "continue_any_ai",
    });
    expect(routeChatIntent("what do you know")).toEqual({
      kind: "workflow",
      workflow: "review_memory",
    });
    expect(routeChatIntent("setup local ai")).toEqual({
      kind: "workflow",
      workflow: "setup_local_ai",
    });
    expect(routeChatIntent("save response")).toEqual({
      kind: "workflow",
      workflow: "paste_ai_response",
    });
    expect(routeChatIntent("create memory update")).toEqual({
      kind: "workflow",
      workflow: "create_memory_update",
    });
  });

  it("routes help and what-do-i-do-next into guidance", () => {
    expect(routeChatIntent("help")).toEqual({ kind: "guidance" });
    expect(routeChatIntent("what do I do next", "memory_imported")).toEqual({
      kind: "guidance",
    });
    expect(routeChatIntent("what do I do next", "context_pack_copied")).toEqual({
      kind: "guidance",
    });
  });

  it("leaves unknown text for the normal chat path", () => {
    expect(routeChatIntent("please explain the bug in this file")).toEqual({
      kind: "none",
    });
  });

  it("summarizes import preview counts and examples without inventing data", () => {
    const summary = summarizeImportPreview({
      valid: true,
      fileType: "continuity-import",
      source: "Claude",
      version: 1,
      sourceAi: "Claude",
      generatedAt: "2026-05-25T00:00:00.000Z",
      projectName: "ContinuityOS Desktop",
      projectType: "Electron app",
      currentObjective: "Move workflows into chat.",
      continuitySummary: "Chat should be the command center.",
      stableFacts: ["SQLite is canonical."],
      recentProgress: ["Added guide card."],
      decisionsMade: ["Do not fake AI replies."],
      openIssues: ["Import still opens Project tools."],
      nextSteps: ["Add in-chat preview."],
      importantContextForNextAi: "Keep it local-first.",
      recentConversationExcerpts: "UNKNOWN",
      testBuildGitStatus: [],
      risksWarnings: [],
      rulesForFutureAi: [],
      warnings: [],
      errors: [],
    });

    expect(summary.source).toBe("Claude");
    expect(summary.projectName).toBe("ContinuityOS Desktop");
    expect(summary.stableFactsCount).toBe(1);
    expect(summary.decisionsCount).toBe(1);
    expect(summary.openIssuesCount).toBe(1);
    expect(summary.nextStepsCount).toBe(1);
    expect(summary.stableFactsExample).toBe("SQLite is canonical.");
    expect(summary.decisionsExample).toBe("Do not fake AI replies.");
  });

  it("builds workflow sessions and prompt definitions for chat rendering", () => {
    const session = createChatWorkflowSession("continue_any_ai", {
      sourceUserMessageId: "message-12345678",
      requestText: "Continue the imported project.",
    });
    const definition = getChatWorkflowDefinition("continue_any_ai");

    expect(session.kind).toBe("continue_any_ai");
    expect(session.sourceUserMessageId).toBe("message-12345678");
    expect(definition.title).toBe("Advanced AI Handoff");
    expect(definition.prompt).toContain("advanced project handoff");
  });

  it("builds a safe request hint with null inputs and ignores workflow commands", () => {
    expect(
      getContextPackRequestHint({
        messages: [
          { role: "user", content: "import memory" },
          { role: "assistant", content: "Sure." },
        ],
        continuitySummary: "Use the saved summary first.\nThen the details.",
      }),
    ).toBe("Use the saved summary first.");

    expect(
      getContextPackRequestHint({
        messages: null,
        guidanceState: "memory_imported",
        continuitySummary: null,
        importedSource: "Claude",
      }),
    ).toBe(
      "Continue this project using the latest ContinuityOS memory imported from Claude.",
    );

    expect(getContextPackRequestHint()).toBe(
      "Continue this project from the latest saved ContinuityOS memory.",
    );
  });
});
