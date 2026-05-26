import { afterEach, describe, expect, it } from "vitest";
import { openTestDatabase } from "../electron/main/database/test-db";
import { buildMemoryCompressionDraft } from "../electron/main/services/memory-compression-service";
import { applyContinuityImportFile } from "../electron/main/services/continuity-import-file";
import { buildUniversalContextPack } from "../electron/main/services/context-pack-service";
import {
  createThread,
  createWorkspace,
  updateContinuitySummary,
} from "../electron/main/services/workspace-service";
import { insertMessage, listMessages } from "../electron/main/services/message-service";

const VALID_IMPORT_FILE = `# CONTINUITYOS MEMORY FILE
version: 1
file_type: continuity-import
source: ChatGPT
generated_at: 2026-05-26T01:00:00.000Z
project_name: ContinuityOS Desktop
project_type: Electron app
## CURRENT OBJECTIVE
Make direct chat feel local-first.
## CONTINUITY SUMMARY
Keep memory visible and reviewable.
## STABLE FACTS
- SQLite is canonical.
## DECISIONS MADE
- Do not fake AI answers.
## OPEN ISSUES
- Add a memory update flow.
## NEXT STEPS
- Build deterministic markdown updates.
## IMPORTANT CONTEXT FOR NEXT AI
Prefer calm local guidance when no engine is active.
`;

describe("memory compression", () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    while (cleanups.length) cleanups.pop()?.();
  });

  function session() {
    const opened = openTestDatabase();
    cleanups.push(opened.cleanup);
    return opened.db;
  }

  it("creates a deterministic markdown memory update draft", () => {
    const db = session();
    const workspace = createWorkspace(db, "Memory Draft");
    updateContinuitySummary(db, workspace.id, "Keep conversations local and durable.");
    const thread = createThread(db, workspace.id, "Compression");
    insertMessage(db, { threadId: thread.id, role: "user", content: "Summarize the current state." });
    insertMessage(db, {
      threadId: thread.id,
      role: "assistant",
      content: "We still need a visible memory update preview.",
    });
    applyContinuityImportFile(db, {
      text: VALID_IMPORT_FILE,
      mode: "update-current",
      workspaceId: workspace.id,
    });

    const draft = buildMemoryCompressionDraft(db, {
      workspaceId: workspace.id,
      threadId: thread.id,
    });

    expect(draft.levels).toEqual([
      "raw_messages",
      "thread_summary",
      "project_state",
      "workspace_memory",
    ]);
    expect(draft.markdown).toContain("# CONTINUITYOS MEMORY FILE");
    expect(draft.markdown).toContain("file_type: project-state");
    expect(draft.markdown).toContain("Keep conversations local and durable.");
    expect(draft.preview.currentObjective).toBe("Make direct chat feel local-first.");
    expect(draft.preview.decisionsMade).toContain("Do not fake AI answers.");
    expect(draft.preview.recentConversationExcerpts).toContain("Summarize the current state.");
  });

  it("uses UNKNOWN for missing fields and does not invent facts", () => {
    const db = session();
    const workspace = createWorkspace(db, "Blank Workspace");
    const thread = createThread(db, workspace.id, "Empty");

    const draft = buildMemoryCompressionDraft(db, {
      workspaceId: workspace.id,
      threadId: thread.id,
    });

    expect(draft.preview.currentObjective).toBe("UNKNOWN");
    expect(draft.preview.continuitySummary).toBe("UNKNOWN");
    expect(draft.preview.stableFacts).toEqual(["UNKNOWN"]);
    expect(draft.preview.decisionsMade).toEqual(["UNKNOWN"]);
    expect(draft.preview.openIssues).toEqual(["UNKNOWN"]);
  });

  it("can be applied and then shows up in later context packs without deleting raw messages", () => {
    const db = session();
    const workspace = createWorkspace(db, "Context Pack Memory");
    const thread = createThread(db, workspace.id, "Main");
    insertMessage(db, { threadId: thread.id, role: "user", content: "Keep this raw question." });
    insertMessage(db, {
      threadId: thread.id,
      role: "assistant",
      content: "Keep this raw answer too.",
    });
    updateContinuitySummary(db, workspace.id, "Memory updates should feed future handoffs.");

    const draft = buildMemoryCompressionDraft(db, {
      workspaceId: workspace.id,
      threadId: thread.id,
    });
    const apply = applyContinuityImportFile(db, {
      text: draft.markdown,
      mode: "update-current",
      workspaceId: workspace.id,
    });

    expect(apply.ok).toBe(true);

    const pack = buildUniversalContextPack(db, {
      workspaceId: workspace.id,
      threadId: thread.id,
      userRequest: "Continue from the latest compressed memory.",
      targetPlatform: "Any AI",
    });

    expect(pack.text).toContain("## Markdown Memory / Project State");
    expect(pack.text).toContain("Memory updates should feed future handoffs.");
    expect(pack.text).toContain("Continue from the latest compressed memory.");

    const messages = listMessages(db, thread.id);
    expect(messages.some((message) => message.content === "Keep this raw question.")).toBe(true);
    expect(messages.some((message) => message.content === "Keep this raw answer too.")).toBe(true);
  });
});
