import { afterEach, describe, expect, it } from "vitest";
import { openTestDatabase } from "../electron/main/database/test-db";
import {
  applyContinuityImportFile,
  listMarkdownMemoryRecords,
  getLatestAppliedContinuityImport,
  parseContinuityImportFile,
  previewContinuityImportFile,
} from "../electron/main/services/continuity-import-file";
import { exportMarkdownMemoryFile } from "../electron/main/services/markdown-memory-service";
import { createThread, createWorkspace, getWorkspaceById } from "../electron/main/services/workspace-service";
import { insertMessage, listMessages } from "../electron/main/services/message-service";
import { buildUniversalContextPack } from "../electron/main/services/context-pack-service";
import { CONTINUITY_IMPORT_FILE_PROMPT } from "../src/shared/continuity-import-prompt";

const VALID_IMPORT_FILE = `# CONTINUITYOS MEMORY FILE
version: 1
file_type: continuity-import
source: ChatGPT
generated_at: 2026-05-25T01:23:45.000Z
project_name: Continuity Desktop
project_type: Electron app
## CURRENT OBJECTIVE
Implement continuity import workflow.
## CONTINUITY SUMMARY
The app should preserve project state across AI chats without inventing facts.
## STABLE FACTS
- Local-first desktop app
- SQLite is the canonical store
## RECENT PROGRESS
- Restored the normal chat composer
## DECISIONS MADE
- Manual Mode stays available
- Unknown must stay unknown
## OPEN ISSUES
- Import workflow still missing
## NEXT STEPS
- Add import preview
- Add local AI fallback
## IMPORTANT CONTEXT FOR NEXT AI
Keep imports user-controlled and beginner-friendly.
## TEST / BUILD / GIT STATUS
- Tests: PASS
- Build: PASS
## RISKS / WARNINGS
- Do not overwrite canonical history
## RULES FOR FUTURE AI
- Do not assume missing facts.
- Keep steps copy/paste-ready when relevant.
`;

describe("continuity import file", () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    while (cleanups.length) cleanups.pop()?.();
  });

  function session() {
    const opened = openTestDatabase();
    cleanups.push(opened.cleanup);
    return opened.db;
  }

  it("parses a valid markdown import file", () => {
    const parsed = parseContinuityImportFile(VALID_IMPORT_FILE);
    expect(parsed.valid).toBe(true);
    expect(parsed.fileType).toBe("continuity-import");
    expect(parsed.source).toBe("ChatGPT");
    expect(parsed.sourceAi).toBe("ChatGPT");
    expect(parsed.projectName).toBe("Continuity Desktop");
    expect(parsed.stableFacts).toEqual(["Local-first desktop app", "SQLite is the canonical store"]);
    expect(parsed.decisionsMade).toContain("Manual Mode stays available");
    expect(parsed.nextSteps).toContain("Add import preview");
  });

  it("handles missing sections with UNKNOWN defaults", () => {
    const parsed = previewContinuityImportFile(`# CONTINUITYOS MEMORY FILE
version: 1
file_type: continuity-import
source: Claude
`);
    expect(parsed.valid).toBe(true);
    expect(parsed.projectName).toBe("UNKNOWN");
    expect(parsed.currentObjective).toBe("UNKNOWN");
    expect(parsed.stableFacts).toEqual([]);
  });

  it("keeps legacy continuity import headers working", () => {
    const parsed = parseContinuityImportFile(`# CONTINUITYOS IMPORT FILE
version: 1
source_ai: Cursor
## CURRENT OBJECTIVE
Preserve compatibility.
`);
    expect(parsed.valid).toBe(true);
    expect(parsed.fileType).toBe("continuity-import");
    expect(parsed.sourceAi).toBe("Cursor");
  });

  it("rejects empty or malformed files calmly", () => {
    expect(previewContinuityImportFile("").valid).toBe(false);
    expect(previewContinuityImportFile("hello world").errors[0]).toMatch(/header/i);
  });

  it("updates the current workspace without deleting canonical messages", () => {
    const db = session();
    const workspace = createWorkspace(db, "Import target");
    const thread = createThread(db, workspace.id, "Chat");
    insertMessage(db, { threadId: thread.id, role: "user", content: "Keep this message" });

    const result = applyContinuityImportFile(db, {
      text: VALID_IMPORT_FILE,
      mode: "update-current",
      workspaceId: workspace.id,
    });

    expect(result.ok).toBe(true);
    expect(getWorkspaceById(db, workspace.id)?.continuitySummary).toContain(
      "Implement continuity import workflow.",
    );
    expect(listMessages(db, thread.id).some((message) => message.content === "Keep this message")).toBe(
      true,
    );
    expect(getLatestAppliedContinuityImport(db, workspace.id)?.projectName).toBe(
      "Continuity Desktop",
    );

    const importedEvents = db
      .prepare(
        "SELECT COUNT(*) AS c FROM timeline_events WHERE workspace_id = ? AND event_type = 'continuity_import_file_applied'",
      )
      .get(workspace.id) as { c: number };
    expect(importedEvents.c).toBe(1);
  });

  it("creates a new workspace when requested", () => {
    const db = session();
    const result = applyContinuityImportFile(db, {
      text: VALID_IMPORT_FILE,
      mode: "create-workspace",
    });

    expect(result.ok).toBe(true);
    expect(result.workspace?.name).toBe("Continuity Desktop");
    expect(result.workspace?.continuitySummary).toContain("preserve project state");
  });

  it("includes imported project state in later context packs", () => {
    const db = session();
    const workspace = createWorkspace(db, "Imported context");
    const thread = createThread(db, workspace.id, "Context thread");
    insertMessage(db, { threadId: thread.id, role: "user", content: "Continue from the import." });

    applyContinuityImportFile(db, {
      text: VALID_IMPORT_FILE,
      mode: "update-current",
      workspaceId: workspace.id,
    });

    const pack = buildUniversalContextPack(db, {
      workspaceId: workspace.id,
      threadId: thread.id,
      userRequest: "Continue this project safely.",
      targetPlatform: "Any AI",
    });

    expect(pack.text).toContain("## Markdown Memory / Project State");
    expect(pack.text).toContain("Continuity Desktop");
    expect(pack.text).toContain("## Stable Facts");
    expect(pack.text).toContain("## Decisions Made");
    expect(pack.text).toContain("## Open Issues");
    expect(pack.text).toContain("## Next Steps");
    expect(pack.text).toContain("## Important Context For Next AI");
    expect(pack.text).toContain("## Rules For Future AI");
  });

  it("ships the copyable import prompt with the required format", () => {
    expect(CONTINUITY_IMPORT_FILE_PROMPT).toContain("Generate a ContinuityOS Markdown Memory File");
    expect(CONTINUITY_IMPORT_FILE_PROMPT).toContain("Return only markdown.");
    expect(CONTINUITY_IMPORT_FILE_PROMPT).toContain("file_type: continuity-import");
    expect(CONTINUITY_IMPORT_FILE_PROMPT).toContain("source:");
    expect(CONTINUITY_IMPORT_FILE_PROMPT).toContain("## CURRENT OBJECTIVE");
  });

  it("exports markdown memory and records it for review", () => {
    const db = session();
    const workspace = createWorkspace(db, "Markdown Memory");
    const thread = createThread(db, workspace.id, "Thread");
    insertMessage(db, { threadId: thread.id, role: "user", content: "Summarize recent work." });
    insertMessage(db, {
      threadId: thread.id,
      role: "assistant",
      content: "We restored the normal chat flow and added import preview.",
    });

    applyContinuityImportFile(db, {
      text: VALID_IMPORT_FILE,
      mode: "update-current",
      workspaceId: workspace.id,
    });

    const exported = exportMarkdownMemoryFile(db, {
      workspaceId: workspace.id,
      threadId: thread.id,
      fileType: "ai-handoff",
    });

    expect(exported.fileName).toBe("ai-handoff.md");
    expect(exported.markdown).toContain("# CONTINUITYOS MEMORY FILE");
    expect(exported.markdown).toContain("file_type: ai-handoff");
    expect(exported.markdown).toContain("source: ContinuityOS");

    const records = listMarkdownMemoryRecords(db, workspace.id);
    expect(records[0]?.fileType).toBe("ai-handoff");
    expect(records.some((record) => record.fileType === "continuity-import")).toBe(true);
  });
});
