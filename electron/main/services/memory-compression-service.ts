import type Database from "better-sqlite3";
import { buildMarkdownMemoryFile } from "../../../src/shared/markdown-memory-schema";
import type {
  MemoryCompressionDraft,
  MemoryCompressionLevel,
  Message,
} from "../../../src/shared/types";
import {
  getLatestAppliedContinuityImport,
  listMarkdownMemoryRecords,
  parseContinuityImportFile,
} from "./continuity-import-file";
import { listMessagesPage } from "./message-service";
import { listTimelineEvents } from "./timeline-service";
import { getWorkspaceById } from "./workspace-service";

const DEFAULT_RULES = [
  "Do not assume missing facts.",
  "Ask concise clarification questions when project truth is unknown.",
  "Preserve prior decisions unless the user explicitly changes them.",
  "Keep implementation guidance copy/paste-ready when relevant.",
];

const MEMORY_LEVELS: MemoryCompressionLevel[] = [
  "raw_messages",
  "thread_summary",
  "project_state",
  "workspace_memory",
];

function sanitize(value: string): string {
  return value
    .replace(/\b(sk-[A-Za-z0-9_-]{10,})\b/g, "[redacted-api-key]")
    .replace(/\b(api[_ -]?key|password|secret|token)\s*[:=]\s*[^\s]+/gi, "$1: [redacted]")
    .trim();
}

function normalizeUnknown(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? sanitize(trimmed) : "UNKNOWN";
}

function hasKnownValue(value: string | null | undefined): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  return Boolean(trimmed) && trimmed.toUpperCase() !== "UNKNOWN";
}

function dedupe(items: string[]): string[] {
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

function formatRecentConversation(messages: Message[]): string {
  const recent = messages.slice(-6);
  if (recent.length === 0) {
    return "UNKNOWN";
  }
  return recent
    .map((message) => {
      const content = sanitize(message.content) || "_Empty_";
      return `### ${formatRole(message.role)}\n${content}`;
    })
    .join("\n\n");
}

function latestUserObjective(messages: Message[]): string {
  const latestUser = [...messages].reverse().find((message) => message.role === "user");
  return normalizeUnknown(latestUser?.content ?? null);
}

export function buildMemoryCompressionDraft(
  db: Database.Database,
  input: { workspaceId: string; threadId?: string | null },
): MemoryCompressionDraft {
  const workspace = getWorkspaceById(db, input.workspaceId);
  if (!workspace) {
    throw new Error("Workspace not found.");
  }

  const messagePage =
    input.threadId != null
      ? listMessagesPage(db, input.threadId, { limit: 12 })
      : { messages: [], totalCount: 0 };
  const recentMessages = [...messagePage.messages].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  const imported = getLatestAppliedContinuityImport(db, input.workspaceId);
  const latestRecord = listMarkdownMemoryRecords(db, input.workspaceId, 1)[0] ?? null;
  const timelineEvents = listTimelineEvents(db, input.workspaceId, 6);
  const recentProgress = dedupe(
    timelineEvents.map((event) => event.description?.trim() || event.title?.trim() || ""),
  );

  const markdown = buildMarkdownMemoryFile({
    fileType: "project-state",
    source: "ContinuityOS",
    generatedAt: new Date().toISOString(),
    projectName: normalizeUnknown(workspace.name),
    projectType: normalizeUnknown(imported?.projectType ?? latestRecord?.fileType ?? null),
    currentObjective: hasKnownValue(imported?.currentObjective)
      ? imported!.currentObjective
      : latestUserObjective(recentMessages),
    continuitySummary: normalizeUnknown(
      workspace.continuitySummary?.trim() || imported?.continuitySummary || null,
    ),
    stableFacts: dedupe(imported?.stableFacts ?? []),
    recentProgress,
    decisionsMade: dedupe(imported?.decisionsMade ?? []),
    openIssues: dedupe(imported?.openIssues ?? []),
    nextSteps: dedupe(imported?.nextSteps ?? []),
    importantContextForNextAi: normalizeUnknown(
      imported?.importantContextForNextAi ??
        workspace.continuitySummary ??
        latestRecord?.continuitySummary ??
        null,
    ),
    recentConversationExcerpts: formatRecentConversation(recentMessages),
    testBuildGitStatus: dedupe(imported?.testBuildGitStatus ?? []),
    risksWarnings: dedupe(imported?.risksWarnings ?? []),
    rulesForFutureAi: dedupe(imported?.rulesForFutureAi ?? DEFAULT_RULES),
  });

  return {
    markdown,
    preview: parseContinuityImportFile(markdown),
    levels: MEMORY_LEVELS,
    sourceMessageCount: recentMessages.length,
    sourceTimelineEventCount: timelineEvents.length,
    latestRecordTitle: latestRecord?.title ?? null,
  };
}
