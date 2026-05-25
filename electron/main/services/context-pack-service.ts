import type Database from "better-sqlite3";
import type {
  ManualAssistantResponseSaveResult,
  ManualExchangeSaveResult,
  Message,
  UniversalContextPackResult,
} from "../../../src/shared/types";
import { runInTransaction } from "../database/transactions";
import { appendTimelineEvent } from "./continuity-service";
import {
  assertMessageThreadContext,
  insertMessage,
  listMessagesPage,
} from "./message-service";
import { getWorkspaceById } from "./workspace-service";

export const DEFAULT_CONTEXT_PACK_MESSAGE_LIMIT = 20;
const MAX_CONTEXT_PACK_SUMMARY_CHARS = 3000;
const MAX_CONTEXT_PACK_MESSAGE_CHARS = 1200;
const MAX_CONTEXT_PACK_REQUEST_CHARS = 2000;

type BuildUniversalContextPackInput = {
  workspaceId: string;
  threadId: string;
  userRequest: string;
  targetPlatform?: string | null;
};

type SaveManualExchangeInput = {
  workspaceId: string;
  threadId: string;
  userRequest: string;
  assistantResponse: string;
  targetPlatform?: string | null;
};

type SaveManualAssistantResponseInput = {
  workspaceId: string;
  threadId: string;
  assistantResponse: string;
  targetPlatform?: string | null;
  sourceUserMessageId?: string | null;
};

function normalizeTargetPlatform(raw: string | null | undefined): string {
  const value = raw?.trim();
  if (!value) return "Any AI";
  return value.slice(0, 60);
}

function truncateForPack(text: string, maxChars: number): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, maxChars).trimEnd()}\n[truncated for context size]`;
}

function formatRole(role: Message["role"]): string {
  if (role === "assistant") return "Assistant";
  if (role === "system") return "System";
  return "User";
}

function getThreadTitle(
  db: Database.Database,
  threadId: string,
  workspaceId: string,
): string {
  const row = db
    .prepare("SELECT title FROM threads WHERE id = ? AND workspace_id = ?")
    .get(threadId, workspaceId) as { title: string } | undefined;
  return row?.title?.trim() || "Current thread";
}

function formatRecentConversation(messages: Message[]): string {
  if (messages.length === 0) {
    return "_No prior messages in this thread yet._";
  }

  return messages
    .map((message) => {
      const content = truncateForPack(message.content, MAX_CONTEXT_PACK_MESSAGE_CHARS) || "_Empty_";
      return `### ${formatRole(message.role)}\n${content}`;
    })
    .join("\n\n");
}

export function buildUniversalContextPack(
  db: Database.Database,
  input: BuildUniversalContextPackInput,
): UniversalContextPackResult {
  const workspaceId = input.workspaceId.trim();
  const threadId = input.threadId.trim();
  const userRequest = input.userRequest.trim();
  if (!workspaceId) throw new Error("workspaceId is required.");
  if (!threadId) throw new Error("threadId is required.");
  if (!userRequest) throw new Error("Enter a request before building a Context Pack.");

  const workspace = getWorkspaceById(db, workspaceId);
  if (!workspace) {
    throw new Error("Workspace not found.");
  }
  assertMessageThreadContext(db, threadId, workspaceId);

  const threadTitle = getThreadTitle(db, threadId, workspaceId);
  const targetPlatform = normalizeTargetPlatform(input.targetPlatform);
  const recentPage = listMessagesPage(db, threadId, {
    limit: DEFAULT_CONTEXT_PACK_MESSAGE_LIMIT,
  });
  const summary = workspace.continuitySummary?.trim()
    ? truncateForPack(workspace.continuitySummary, MAX_CONTEXT_PACK_SUMMARY_CHARS)
    : "No continuity summary saved yet.";
  const requestBlock = truncateForPack(userRequest, MAX_CONTEXT_PACK_REQUEST_CHARS);
  const olderMessagesOmitted = recentPage.totalCount > recentPage.messages.length;
  const olderMessageNote = olderMessagesOmitted
    ? `[Older saved conversation omitted for context size. Showing ${recentPage.messages.length} of ${recentPage.totalCount} messages.]`
    : "Showing the newest saved conversation context.";

  const text = [
    "# CONTINUITYOS UNIVERSAL CONTEXT PACK",
    "",
    "## Purpose",
    `You are helping the user continue a long-running project conversation in a new AI chat on ${targetPlatform}.`,
    "",
    "## Project",
    `Name: ${workspace.name}`,
    `Current thread: ${threadTitle}`,
    `Current objective: ${requestBlock}`,
    "",
    "## Continuity Summary",
    summary,
    "",
    "## Recent Conversation Context",
    olderMessageNote,
    "",
    formatRecentConversation(recentPage.messages),
    "",
    "## Current User Request",
    requestBlock,
    "",
    "## Instructions For This AI",
    "You are continuing an existing project conversation from ContinuityOS.",
    "Use the context below to pick up where the user left off.",
    "Do not assume facts not present.",
    "If something is missing, ask a concise clarification question.",
    "- Continue from the provided context.",
    "- Do not assume missing facts.",
    "- Preserve project decisions already made.",
    "- If context is insufficient, ask for clarification.",
    "- Keep the answer actionable.",
    "- If giving implementation steps, make them copy/paste-ready.",
  ].join("\n");

  appendTimelineEvent(db, {
    workspaceId,
    threadId,
    type: "manual_context_pack_created",
    title: "Context pack created",
    description: `Prepared a ${targetPlatform} context pack with ${recentPage.messages.length} recent messages.`,
    source: "user",
  });

  return {
    targetPlatform,
    text,
    includedRecentMessageCount: recentPage.messages.length,
    truncatedOlderMessages: olderMessagesOmitted,
  };
}

export function saveManualExchange(
  db: Database.Database,
  input: SaveManualExchangeInput,
): ManualExchangeSaveResult {
  const workspaceId = input.workspaceId.trim();
  const threadId = input.threadId.trim();
  const userRequest = input.userRequest.trim();
  const assistantResponse = input.assistantResponse.trim();
  const targetPlatform = normalizeTargetPlatform(input.targetPlatform);

  if (!workspaceId) throw new Error("workspaceId is required.");
  if (!threadId) throw new Error("threadId is required.");
  if (!userRequest) throw new Error("User request cannot be empty.");
  if (!assistantResponse) throw new Error("AI response cannot be empty.");

  return runInTransaction(db, () => {
    assertMessageThreadContext(db, threadId, workspaceId);

    const userMessage = insertMessage(db, {
      threadId,
      role: "user",
      content: userRequest,
      rawProviderPayload: {
        source: "manual_context_pack",
        targetPlatform,
        kind: "request",
      },
    });
    const assistantMessage = insertMessage(db, {
      threadId,
      role: "assistant",
      content: assistantResponse,
      provider: "manual",
      model: targetPlatform,
      rawProviderPayload: {
        source: "manual_context_pack",
        targetPlatform,
        kind: "response",
      },
    });

    appendTimelineEvent(db, {
      workspaceId,
      threadId,
      type: "manual_ai_response_saved",
      title: "Manual AI response saved",
      description: `Saved a pasted response from ${targetPlatform}.`,
      source: "user",
    });

    return {
      userMessage,
      assistantMessage,
      targetPlatform,
    };
  });
}

export function saveManualAssistantResponse(
  db: Database.Database,
  input: SaveManualAssistantResponseInput,
): ManualAssistantResponseSaveResult {
  const workspaceId = input.workspaceId.trim();
  const threadId = input.threadId.trim();
  const assistantResponse = input.assistantResponse.trim();
  const targetPlatform = normalizeTargetPlatform(input.targetPlatform);
  const sourceUserMessageId = input.sourceUserMessageId?.trim() || null;

  if (!workspaceId) throw new Error("workspaceId is required.");
  if (!threadId) throw new Error("threadId is required.");
  if (!assistantResponse) throw new Error("AI response cannot be empty.");

  return runInTransaction(db, () => {
    assertMessageThreadContext(db, threadId, workspaceId);

    if (sourceUserMessageId) {
      const row = db
        .prepare("SELECT id, thread_id, role FROM messages WHERE id = ?")
        .get(sourceUserMessageId) as
        | { id: string; thread_id: string; role: Message["role"] }
        | undefined;
      if (!row || row.thread_id !== threadId || row.role !== "user") {
        throw new Error("sourceUserMessageId must point to a user message in this thread.");
      }
    }

    const assistantMessage = insertMessage(db, {
      threadId,
      role: "assistant",
      content: assistantResponse,
      provider: "manual",
      model: targetPlatform,
      rawProviderPayload: {
        source: "manual_context_pack",
        targetPlatform,
        kind: "response",
        sourceUserMessageId,
      },
    });

    appendTimelineEvent(db, {
      workspaceId,
      threadId,
      type: "manual_ai_response_saved",
      title: "Manual AI response saved",
      description: `Saved a pasted response from ${targetPlatform}.`,
      source: "user",
    });

    return {
      assistantMessage,
      targetPlatform,
      sourceUserMessageId,
    };
  });
}
