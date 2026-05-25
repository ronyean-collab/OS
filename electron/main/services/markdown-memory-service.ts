import { v4 as uuid } from "uuid";
import type Database from "better-sqlite3";
import {
  buildMarkdownMemoryFile,
  MARKDOWN_MEMORY_FILE_NAMES,
  type MarkdownMemoryContent,
} from "../../../src/shared/markdown-memory-schema";
import type {
  MarkdownMemoryExportResult,
  MarkdownMemoryFileType,
  Message,
} from "../../../src/shared/types";
import {
  GENERATED_RECORD_TYPE,
  getLatestAppliedContinuityImport,
  parseContinuityImportFile,
} from "./continuity-import-file";
import { listMessagesPage } from "./message-service";
import { getWorkspaceById } from "./workspace-service";

const DEFAULT_RULES = [
  "Do not assume missing facts.",
  "Ask questions when project truth is unknown.",
  "Preserve existing decisions.",
  "Keep steps copy/paste-ready when relevant.",
];

function hasKnownValue(value: string | null | undefined): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  return Boolean(trimmed) && trimmed.toUpperCase() !== "UNKNOWN";
}

function sanitizeForMarkdownMemory(value: string): string {
  return value
    .replace(/\b(sk-[A-Za-z0-9_-]{10,})\b/g, "[redacted-api-key]")
    .replace(/\b(api[_ -]?key|password|secret|token)\s*[:=]\s*[^\s]+/gi, "$1: [redacted]")
    .trim();
}

function normalizeUnknown(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? sanitizeForMarkdownMemory(trimmed) : "UNKNOWN";
}

function dedupeList(items: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const item of items) {
    const cleaned = normalizeUnknown(item);
    if (cleaned === "UNKNOWN") continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(cleaned);
  }
  return output;
}

function formatRole(role: Message["role"]): string {
  if (role === "assistant") return "Assistant";
  if (role === "system") return "System";
  return "User";
}

function formatRecentConversation(messages: Message[], limit: number): string {
  const recent = messages.slice(-limit);
  if (recent.length === 0) return "UNKNOWN";
  return recent
    .map((message) => `### ${formatRole(message.role)}\n${sanitizeForMarkdownMemory(message.content) || "_Empty_"}`)
    .join("\n\n");
}

function getThreadTitle(db: Database.Database, threadId: string | null | undefined): string {
  if (!threadId) return "UNKNOWN";
  const row = db
    .prepare("SELECT title FROM threads WHERE id = ?")
    .get(threadId) as { title: string } | undefined;
  return normalizeUnknown(row?.title ?? null);
}

function listRecentTimelineItems(db: Database.Database, workspaceId: string, limit = 5): string[] {
  const rows = db
    .prepare(
      `SELECT title, description
       FROM timeline_events
       WHERE workspace_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT ?`,
    )
    .all(workspaceId, limit) as Array<{ title: string | null; description: string | null }>;

  return dedupeList(
    rows.map((row) => {
      if (row.description?.trim()) return row.description.trim();
      return row.title?.trim() ?? "";
    }),
  );
}

function latestUserMessage(messages: Message[]): string {
  const userMessage = [...messages].reverse().find((message) => message.role === "user");
  return normalizeUnknown(userMessage?.content ?? null);
}

function buildImportantContext(fileType: MarkdownMemoryFileType, importedContext: string): string {
  if (hasKnownValue(importedContext)) {
    return importedContext;
  }
  if (fileType === "ai-handoff") {
    return "This markdown handoff was generated from ContinuityOS. Continue from the current objective, preserve prior decisions, and ask concise clarifying questions when anything is unknown.";
  }
  if (fileType === "thread-summary") {
    return "This file summarizes the current thread only. Use it as a bounded snapshot of recent work, not as the full project history.";
  }
  return "This markdown memory was generated from visible local project state in ContinuityOS.";
}

function buildTestBuildGitStatus(fileType: MarkdownMemoryFileType, importedStatus: string[]): string[] {
  if (importedStatus.length > 0) {
    return dedupeList(importedStatus);
  }
  if (fileType === "ai-handoff" || fileType === "continuity-export") {
    return [
      "Tests: UNKNOWN",
      "Build: UNKNOWN",
      "Latest commit: UNKNOWN",
      "Branch: UNKNOWN",
      "Remote: UNKNOWN",
    ];
  }
  return [];
}

function buildContent(
  db: Database.Database,
  input: { workspaceId: string; threadId?: string | null; fileType: MarkdownMemoryFileType },
): MarkdownMemoryContent {
  const workspace = getWorkspaceById(db, input.workspaceId);
  if (!workspace) {
    throw new Error("Workspace not found.");
  }

  const imported = getLatestAppliedContinuityImport(db, input.workspaceId);
  const recentPage =
    input.threadId != null
      ? listMessagesPage(db, input.threadId, { limit: 8 })
      : { messages: [], totalCount: 0 };
  const recentMessages = [...recentPage.messages].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  const timelineItems = listRecentTimelineItems(db, input.workspaceId, 5);
  const threadTitle = getThreadTitle(db, input.threadId);
  const currentObjective = hasKnownValue(imported?.currentObjective)
    ? imported!.currentObjective
    : latestUserMessage(recentMessages);
  const continuitySummary = normalizeUnknown(
    workspace.continuitySummary?.trim() || imported?.continuitySummary || null,
  );
  const recentConversationExcerpts =
    input.fileType === "project-state" && recentMessages.length === 0
      ? "UNKNOWN"
      : formatRecentConversation(recentMessages, input.fileType === "thread-summary" ? 6 : 4);
  const recentProgress =
    imported?.recentProgress.length && input.fileType !== "thread-summary"
      ? dedupeList(imported.recentProgress)
      : timelineItems;

  return {
    fileType: input.fileType,
    source: "ContinuityOS",
    generatedAt: new Date().toISOString(),
    projectName: normalizeUnknown(workspace.name),
    projectType:
      hasKnownValue(imported?.projectType) && imported
        ? imported.projectType
        : input.fileType === "thread-summary"
          ? `Thread summary: ${threadTitle}`
          : "UNKNOWN",
    currentObjective,
    continuitySummary,
    stableFacts: dedupeList(imported?.stableFacts ?? []),
    recentProgress: dedupeList(recentProgress),
    decisionsMade: dedupeList(imported?.decisionsMade ?? []),
    openIssues: dedupeList(imported?.openIssues ?? []),
    nextSteps: dedupeList(imported?.nextSteps ?? []),
    importantContextForNextAi: buildImportantContext(
      input.fileType,
      imported?.importantContextForNextAi ?? "UNKNOWN",
    ),
    recentConversationExcerpts,
    testBuildGitStatus: buildTestBuildGitStatus(input.fileType, imported?.testBuildGitStatus ?? []),
    risksWarnings: dedupeList(imported?.risksWarnings ?? []),
    rulesForFutureAi: dedupeList(imported?.rulesForFutureAi ?? DEFAULT_RULES),
  };
}

function persistGeneratedRecord(
  db: Database.Database,
  workspaceId: string,
  markdown: string,
  preview: ReturnType<typeof parseContinuityImportFile>,
): void {
  db.prepare(
    `INSERT INTO continuity_records (id, workspace_id, record_type, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(
    uuid(),
    workspaceId,
    GENERATED_RECORD_TYPE,
    JSON.stringify({
      ...preview,
      rawSource: markdown,
    }),
    new Date().toISOString(),
  );
}

export function exportMarkdownMemoryFile(
  db: Database.Database,
  input: {
    workspaceId: string;
    threadId?: string | null;
    fileType: MarkdownMemoryFileType;
  },
): MarkdownMemoryExportResult {
  const content = buildContent(db, input);
  const markdown = buildMarkdownMemoryFile(content);
  const preview = parseContinuityImportFile(markdown);

  persistGeneratedRecord(db, input.workspaceId, markdown, preview);

  return {
    fileType: input.fileType,
    fileName: MARKDOWN_MEMORY_FILE_NAMES[input.fileType],
    markdown,
    preview,
  };
}
