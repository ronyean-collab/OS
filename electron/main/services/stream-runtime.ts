import { v4 as uuid } from "uuid";
import type { WebContents } from "electron";
import type Database from "better-sqlite3";
import type { Message } from "../../../src/shared/types";
import { IPC } from "../../../src/shared/ipc-channels";
import { getProviderAdapter } from "../providers";
import { getProviderDefinition } from "../../../src/shared/provider-definitions";
import {
  isProviderRuntimeReady,
  providerRuntimeMessage,
} from "./provider-runtime";
import { getOllamaProviderConfig, getProviderBaseUrl } from "./provider-service";
import { openAIAdapter } from "../providers/openai-adapter";
import type { ProviderAdapter } from "../providers/types";
import { secureStorage } from "../secure-storage";
import { runInTransaction } from "../database/transactions";
import {
  appendTimelineEvent,
} from "./continuity-service";
import {
  buildImportedStateContextBlock,
  getLatestAppliedContinuityImport,
} from "./continuity-import-file";
import {
  applyContextTruncation,
  assembleProviderContext,
  DEFAULT_CONTEXT_MESSAGE_LIMIT,
} from "./context-assembly";
import {
  assertMessageThreadContext,
  finalizeAssistantMessage,
  insertMessage,
  listMessagesPage,
  setMessageStatus,
  updateMessageContent,
} from "./message-service";
import { getWorkspaceById } from "./workspace-service";

export type ActiveStream = {
  streamId: string;
  threadId: string;
  assistantMessageId: string;
  workspaceId: string;
  abortController: AbortController;
  provider: string;
};

const activeStreams = new Map<string, ActiveStream>();

export function getActiveStream(streamId: string): ActiveStream | undefined {
  return activeStreams.get(streamId);
}

export function cancelStream(
  db: Database.Database,
  streamId: string,
  sender?: WebContents,
): boolean {
  const session = activeStreams.get(streamId);
  if (!session) return false;

  session.abortController.abort();
  const adapter = getProviderAdapter(session.provider);
  adapter?.cancelStream(streamId);
  if (session.provider === "openai") {
    openAIAdapter.unregisterStreamAbort(streamId);
  }

  const partialContent = getPartialContent(db, session.assistantMessageId);

  runInTransaction(db, () => {
    setMessageStatus(db, session.assistantMessageId, "cancelled");
    appendTimelineEvent(db, {
      workspaceId: session.workspaceId,
      threadId: session.threadId,
      type: "assistant_response_cancelled",
      title: "Generation cancelled",
      description: partialContent.slice(0, 120) || "Cancelled before content arrived.",
    });
  });

  activeStreams.delete(streamId);

  if (sender) {
    emit(sender, IPC.STREAM_ERROR, {
      streamId,
      messageId: session.assistantMessageId,
      content: partialContent,
      error: "Generation cancelled",
      cancelled: true,
    });
  }

  return true;
}

function getPartialContent(db: Database.Database, messageId: string): string {
  const row = db
    .prepare("SELECT content FROM messages WHERE id = ?")
    .get(messageId) as { content: string } | undefined;
  return row?.content ?? "";
}

function emit(
  sender: WebContents,
  channel: string,
  payload: Record<string, unknown>,
): void {
  if (!sender.isDestroyed()) {
    sender.send(channel, payload);
  }
}

function logOllamaRoute(details: Record<string, unknown>): void {
  if (process.env.NODE_ENV === "production") {
    return;
  }
  console.info("[continuity] ollama route", details);
}

export type OllamaStreamOverride = {
  model: string;
  baseUrl: string;
};

export async function startAssistantStream(
  db: Database.Database,
  sender: WebContents,
  input: { threadId: string; content: string; ollama?: OllamaStreamOverride },
): Promise<{
  streamId: string | null;
  userMessage: Message | null;
  assistantMessage: Message | null;
  error?: string;
}> {
  const threadId = input.threadId.trim();
  const content = input.content.trim();
  if (!threadId || !content) {
    throw new Error("threadId and content are required.");
  }

  let workspaceId: string;
  try {
    workspaceId = assertMessageThreadContext(db, threadId).workspaceId;
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Invalid thread for this workspace.";
    return {
      streamId: null,
      userMessage: null,
      assistantMessage: null,
      error: message,
    };
  }

  const userMessage = insertMessage(db, {
    threadId,
    role: "user",
    content,
    messageStatus: "completed",
  });

  const provider = "ollama";
  const ollamaOverride = input.ollama;
  const storedOllama = getOllamaProviderConfig(db, workspaceId);
  const storedRow = db
    .prepare(
      `SELECT * FROM provider_configs
       WHERE workspace_id = ? AND provider = 'ollama'
       ORDER BY updated_at DESC LIMIT 1`,
    )
    .get(workspaceId) as Record<string, unknown> | undefined;

  const model =
    ollamaOverride?.model.trim() ||
    storedOllama?.model.trim() ||
    (storedRow ? String(storedRow.model).trim() : "");

  const def = getProviderDefinition(provider);
  const baseUrl =
    ollamaOverride?.baseUrl.trim() ||
    storedOllama?.baseUrl?.trim() ||
    getProviderBaseUrl(db, workspaceId, provider) ||
    def.defaultBaseUrl ||
    "";

  logOllamaRoute({
    route: "send-start",
    workspaceId,
    threadId,
    ollamaOverride: ollamaOverride ?? null,
    selectedModel: model || null,
    baseUrl: baseUrl || null,
    storedProviderModel: storedOllama?.model ?? null,
    storedProviderBaseUrl: storedOllama?.baseUrl ?? null,
  });

  if (!model) {
    const legacyCloud = db
      .prepare(
        `SELECT provider FROM provider_configs
         WHERE workspace_id = ? AND enabled = 1 AND provider != 'ollama' LIMIT 1`,
      )
      .get(workspaceId) as { provider: string } | undefined;

    return {
      streamId: null,
      userMessage,
      assistantMessage: null,
      error: legacyCloud
        ? "In-app chat uses Ollama only. Open Ollama Setup, detect Ollama, and select a local model."
        : "Select a local Ollama model in Ollama Setup.",
    };
  }

  if (!baseUrl) {
    return {
      streamId: null,
      userMessage,
      assistantMessage: null,
      error: "Set the Ollama base URL in Ollama Setup.",
    };
  }

  if (!isProviderRuntimeReady(provider)) {
    return {
      streamId: null,
      userMessage,
      assistantMessage: null,
      error: providerRuntimeMessage(provider),
    };
  }

  const connectionValue = baseUrl;
  const adapter = getProviderAdapter(provider);

  if (!adapter || !adapter.isConfigured(connectionValue)) {
    logOllamaRoute({
      route: "unavailable",
      provider,
      model,
      baseUrl: connectionValue,
    });
    return {
      streamId: null,
      userMessage,
      assistantMessage: null,
      error:
        "Ollama is not reachable at the configured base URL. Open Ollama Setup to detect the local server again.",
    };
  }

  logOllamaRoute({
    route: "ollama",
    provider,
    model,
    baseUrl: connectionValue,
    threadId,
    workspaceId,
    usedOverride: Boolean(ollamaOverride),
  });

  const historyPage = listMessagesPage(db, threadId, {
    limit: DEFAULT_CONTEXT_MESSAGE_LIMIT,
  }).messages;
  const history = historyPage.some((message) => message.id === userMessage.id)
    ? historyPage
    : [...historyPage.slice(-(DEFAULT_CONTEXT_MESSAGE_LIMIT - 1)), userMessage];
  const ws = getWorkspaceById(db, workspaceId);
  const importedState = getLatestAppliedContinuityImport(db, workspaceId);
  const { messages: contextMessages, estimatedTokens } = assembleProviderContext({
    workspaceName: ws?.name ?? "Workspace",
    continuitySummary: ws?.continuitySummary ?? null,
    importedContextBlock: buildImportedStateContextBlock(importedState),
    messages: history,
  });
  const truncated = applyContextTruncation(contextMessages, 128_000);

  const assistantMessage = insertMessage(db, {
    threadId,
    role: "assistant",
    content: "",
    provider,
    model,
    messageStatus: "streaming",
    recordTimeline: false,
    recordSnapshot: false,
  });

  const streamId = uuid();
  const abortController = new AbortController();

  if (provider === "openai") {
    openAIAdapter.registerStreamAbort(streamId, abortController);
  }

  activeStreams.set(streamId, {
    streamId,
    threadId,
    assistantMessageId: assistantMessage.id,
    workspaceId,
    abortController,
    provider,
  });

  appendTimelineEvent(db, {
    workspaceId,
    threadId,
    type: "assistant_response_started",
    title: "Assistant responding",
    description: `${provider} / ${model} · ~${estimatedTokens} tokens context`,
  });

  void runStream({
    db,
    sender,
    streamId,
    adapter,
    connectionValue: String(connectionValue ?? ""),
    model,
    provider,
    contextMessages: truncated,
    session: activeStreams.get(streamId)!,
  });

  return { streamId, userMessage, assistantMessage };
}

async function runStream(args: {
  db: Database.Database;
  sender: WebContents;
  streamId: string;
  adapter: ProviderAdapter;
  connectionValue: string;
  model: string;
  provider: string;
  contextMessages: ReturnType<typeof assembleProviderContext>["messages"];
  session: ActiveStream;
}): Promise<void> {
  const {
    db,
    sender,
    streamId,
    adapter,
    connectionValue,
    model,
    provider,
    contextMessages,
    session,
  } =
    args;

  await adapter.streamMessage(
    { model, messages: contextMessages },
    connectionValue,
    {
      onChunk: (delta, accumulated) => {
        updateMessageContent(db, session.assistantMessageId, accumulated);
        emit(sender, IPC.STREAM_DELTA, {
          streamId,
          messageId: session.assistantMessageId,
          delta,
          content: accumulated,
        });
      },
      onComplete: (result) => {
        if (!activeStreams.has(streamId)) {
          return;
        }

        const finalized = finalizeAssistantMessage(
          db,
          session.assistantMessageId,
          result.content,
          result.rawPayload,
          provider,
          result.model,
        );

        runInTransaction(db, () => {
          appendTimelineEvent(db, {
            workspaceId: session.workspaceId,
            threadId: session.threadId,
            type: "assistant_response_completed",
            title: "Assistant response completed",
            description: result.content.slice(0, 120),
          });
        });

        activeStreams.delete(streamId);
        if (provider === "openai") {
          openAIAdapter.unregisterStreamAbort(streamId);
        }

        emit(sender, IPC.STREAM_DONE, {
          streamId,
          message: finalized,
        });
      },
      onError: (error) => {
        if (!activeStreams.has(streamId)) {
          return;
        }

        const partial = getPartialContent(db, session.assistantMessageId);
        const isCancel = error.message.includes("cancel") || error.name === "AbortError";

        runInTransaction(db, () => {
          if (isCancel) {
            setMessageStatus(db, session.assistantMessageId, "cancelled");
          } else {
            logOllamaRoute({
              route: "error",
              provider,
              model,
              baseUrl: connectionValue,
              error: error.message,
              threadId: session.threadId,
              workspaceId: session.workspaceId,
            });
            setMessageStatus(db, session.assistantMessageId, "failed");
            appendTimelineEvent(db, {
              workspaceId: session.workspaceId,
              threadId: session.threadId,
              type: "assistant_response_failed",
              title: "Assistant response failed",
              description: error.message.slice(0, 200),
            });
          }
        });

        activeStreams.delete(streamId);
        if (provider === "openai") {
          openAIAdapter.unregisterStreamAbort(streamId);
        }

        emit(sender, IPC.STREAM_ERROR, {
          streamId,
          messageId: session.assistantMessageId,
          content: partial,
          error: error.message,
          cancelled: isCancel,
        });
      },
    },
    session.abortController.signal,
  );
}
