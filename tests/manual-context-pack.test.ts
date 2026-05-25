import { describe, expect, it, afterEach } from "vitest";
import { openTestDatabase } from "../electron/main/database/test-db";
import {
  buildUniversalContextPack,
  DEFAULT_CONTEXT_PACK_MESSAGE_LIMIT,
  saveManualExchange,
} from "../electron/main/services/context-pack-service";
import {
  createThread,
  createWorkspace,
  updateContinuitySummary,
} from "../electron/main/services/workspace-service";
import { insertMessage, listMessages } from "../electron/main/services/message-service";
import {
  buildWorkspaceExportPackage,
  serializeExportPackage,
} from "../electron/main/services/workspace-export";
import { executeWorkspaceImport } from "../electron/main/services/workspace-import";

describe("manual context pack", () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    while (cleanups.length) cleanups.pop()?.();
  });

  function session() {
    const s = openTestDatabase();
    cleanups.push(s.cleanup);
    return s.db;
  }

  it("builds a universal context pack with workspace, summary, messages, and request", () => {
    const db = session();
    const ws = createWorkspace(db, "Universal Lab");
    updateContinuitySummary(db, ws.id, "Prefer local-first tools and calm recovery paths.");
    const thread = createThread(db, ws.id, "Migration planning");
    insertMessage(db, { threadId: thread.id, role: "user", content: "We need a migration plan." });
    insertMessage(db, {
      threadId: thread.id,
      role: "assistant",
      content: "Start with a safety snapshot and test coverage.",
    });

    const result = buildUniversalContextPack(db, {
      workspaceId: ws.id,
      threadId: thread.id,
      userRequest: "Help me continue this plan in a fresh AI chat.",
      targetPlatform: "ChatGPT",
    });

    expect(result.targetPlatform).toBe("ChatGPT");
    expect(result.text).toContain("# CONTINUITYOS UNIVERSAL CONTEXT PACK");
    expect(result.text).toContain("Name: Universal Lab");
    expect(result.text).toContain("Current thread: Migration planning");
    expect(result.text).toContain("Prefer local-first tools and calm recovery paths.");
    expect(result.text).toContain("We need a migration plan.");
    expect(result.text).toContain("Help me continue this plan in a fresh AI chat.");
    expect(result.text).toContain("Do not assume facts not present.");
  });

  it("limits recent history in the context pack", () => {
    const db = session();
    const ws = createWorkspace(db, "History cap");
    const thread = createThread(db, ws.id, "Long thread");
    for (let i = 0; i < DEFAULT_CONTEXT_PACK_MESSAGE_LIMIT + 5; i++) {
      insertMessage(db, {
        threadId: thread.id,
        role: i % 2 === 0 ? "user" : "assistant",
        content: `turn-${i}`,
      });
    }

    const result = buildUniversalContextPack(db, {
      workspaceId: ws.id,
      threadId: thread.id,
      userRequest: "Continue from the latest state.",
      targetPlatform: "Any AI",
    });

    expect(result.includedRecentMessageCount).toBe(DEFAULT_CONTEXT_PACK_MESSAGE_LIMIT);
    expect(result.truncatedOlderMessages).toBe(true);
    expect(result.text).toContain(`Showing ${DEFAULT_CONTEXT_PACK_MESSAGE_LIMIT} of`);
    expect(result.text).toContain(`turn-${DEFAULT_CONTEXT_PACK_MESSAGE_LIMIT + 4}`);
    expect(result.text).not.toContain("turn-0");
  });

  it("handles empty continuity summary safely", () => {
    const db = session();
    const ws = createWorkspace(db, "No summary");
    const thread = createThread(db, ws.id, "T");

    const result = buildUniversalContextPack(db, {
      workspaceId: ws.id,
      threadId: thread.id,
      userRequest: "Start here.",
    });

    expect(result.text).toContain("## Continuity Summary");
    expect(result.text).toContain("No continuity summary saved yet.");
  });

  it("saves a manual exchange without a provider configuration", () => {
    const db = session();
    const ws = createWorkspace(db, "Manual save");
    const thread = createThread(db, ws.id, "No provider required");

    const saved = saveManualExchange(db, {
      workspaceId: ws.id,
      threadId: thread.id,
      userRequest: "Summarize our next migration steps.",
      assistantResponse: "Take a backup, apply the migration, then validate imports.",
      targetPlatform: "Claude",
    });

    const messages = listMessages(db, thread.id);
    expect(messages).toHaveLength(2);
    expect(messages[0].content).toBe("Summarize our next migration steps.");
    expect(messages[1].content).toBe("Take a backup, apply the migration, then validate imports.");
    expect(saved.assistantMessage.provider).toBe("manual");
    expect(saved.assistantMessage.model).toBe("Claude");
    expect(saved.assistantMessage.rawProviderPayload).toContain("manual_context_pack");
  });

  it("rejects empty manual exchange values and avoids orphan writes", () => {
    const db = session();
    const ws = createWorkspace(db, "Reject empties");
    const other = createWorkspace(db, "Other");
    const thread = createThread(db, ws.id, "Thread");
    const before = listMessages(db, thread.id).length;

    expect(() =>
      saveManualExchange(db, {
        workspaceId: ws.id,
        threadId: thread.id,
        userRequest: "   ",
        assistantResponse: "Answer",
      }),
    ).toThrow(/User request cannot be empty/);

    expect(() =>
      saveManualExchange(db, {
        workspaceId: other.id,
        threadId: thread.id,
        userRequest: "Question",
        assistantResponse: "Answer",
      }),
    ).toThrow(/active workspace/);

    expect(listMessages(db, thread.id)).toHaveLength(before);
  });

  it("exports and imports manual exchanges as normal messages", () => {
    const db = session();
    const ws = createWorkspace(db, "Manual export");
    updateContinuitySummary(db, ws.id, "Keep the imported manual exchange readable.");
    const thread = createThread(db, ws.id, "External AI");
    saveManualExchange(db, {
      workspaceId: ws.id,
      threadId: thread.id,
      userRequest: "What should I do next?",
      assistantResponse: "Triage blockers, then apply the safe fix.",
      targetPlatform: "Gemini",
    });

    const json = serializeExportPackage(buildWorkspaceExportPackage(db, ws.id));
    const result = executeWorkspaceImport(db, json);
    expect(result.ok).toBe(true);
    expect(result.workspace?.continuitySummary).toBe(
      "Keep the imported manual exchange readable.",
    );

    const importedThread = db
      .prepare("SELECT id FROM threads WHERE workspace_id = ? LIMIT 1")
      .get(result.workspaceId!) as { id: string };
    const importedMessages = listMessages(db, importedThread.id);
    expect(importedMessages.some((m) => m.content === "What should I do next?")).toBe(true);
    expect(
      importedMessages.some((m) => m.content === "Triage blockers, then apply the safe fix."),
    ).toBe(true);
  });
});
