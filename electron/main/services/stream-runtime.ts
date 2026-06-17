import { v4 as uuid } from "uuid";
import type { WebContents } from "electron";
import type Database from "better-sqlite3";
import type { Message } from "../../../src/shared/types";
import { IPC } from "../../../src/shared/ipc-channels";
import { getProviderAdapter } from "../providers";
import { registerStreamAbort, unregisterStreamAbort } from "../providers/stream-abort-registry";
import type { ProviderAdapter } from "../providers/types";
import { runInTransaction } from "../database/transactions";
import { appendTimelineEvent } from "./continuity-service";
import {
  buildImportedStateContextBlock,
  getLatestAppliedContinuityImport,
} from "./continuity-import-file";
import {
  buildContinuityFeelingBlock,
  buildMemoryStateContextBlock,
  buildRelevantFragmentsContextBlock,
  getMemoryState,
  listRelevantMemoryFragments,
  persistCalibrationSnapshot,
  persistContinuityValidationSnapshot,
  scoreContinuityReconstruction,
} from "./memory-state-service";
import {
  getProviderCapabilityMetadata,
  normalizeProviderContext,
} from "./provider-continuity";
import {
  applyContextTruncation,
  assembleProviderContext,
  DEFAULT_CONTEXT_MESSAGE_LIMIT,
} from "./context-assembly";
import { buildConversationAwarenessContext } from "./continuity-awareness-service";
import { buildAssistantIdentityPromptForProfile } from "./assistant-identity-service";
import { getAssistantProfile } from "./assistant-profile-service";
import {
  calmProviderUnavailableMessage,
  resolveChatProvider,
} from "./chat-provider-resolution";
import { resolveDefaultAiRoute, buildResolvedFromRoute } from "./default-ai-runtime";
import { providerRuntimeMessage } from "./provider-runtime";
import { buildWebContextBlock } from "./web-knowledge-service";
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
  unregisterStreamAbort(streamId);

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

function logProviderRoute(details: Record<string, unknown>): void {
  if (process.env.NODE_ENV === "production") {
    return;
  }
  console.info("[continuity] provider route", details);
}

function registerAdapterStreamAbort(
  streamId: string,
  provider: string,
  controller: AbortController,
): void {
  registerStreamAbort(streamId, controller);
}

function unregisterAdapterStreamAbort(streamId: string, provider: string): void {
  unregisterStreamAbort(streamId);
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

  let userMessage: Message | null = null;

  const route = await resolveDefaultAiRoute(db, workspaceId);
  let resolved = buildResolvedFromRoute(db, workspaceId, route);
  if (!resolved) {
    const legacy = resolveChatProvider(db, workspaceId);
    if (legacy && (legacy.providerId !== "ollama" || route.status === "ready" || route.source === "local")) {
      resolved = legacy;
    }
  }
  const ollamaOverride = input.ollama;

  let provider = resolved?.providerId ?? "";
  let model = resolved?.model ?? "";
  let connectionValue = resolved?.connectionValue ?? "";
  let requestBaseUrl = resolved?.requestBaseUrl ?? null;

  if (ollamaOverride?.model.trim() && ollamaOverride.baseUrl.trim()) {
    provider = "ollama";
    model = ollamaOverride.model.trim();
    connectionValue = ollamaOverride.baseUrl.trim();
    requestBaseUrl = connectionValue;
  }

  logProviderRoute({
    route: "send-start",
    workspaceId,
    threadId,
    provider: provider || null,
    selectedModel: model || null,
    usedOverride: Boolean(ollamaOverride),
  });

  if (!provider || !model) {
    return {
      streamId: null,
      userMessage: null,
      assistantMessage: null,
      error:
        "ContinuityOS AI isn't ready yet. Your message can still be saved — connect AI in Settings when you're ready.",
    };
  }

  const adapter = getProviderAdapter(provider);
  if (!adapter) {
    return {
      streamId: null,
      userMessage: null,
      assistantMessage: null,
      error: providerRuntimeMessage(provider),
    };
  }

  if (!adapter.isConfigured(connectionValue)) {
    logProviderRoute({
      route: "unavailable",
      provider,
      model,
    });
    return {
      streamId: null,
      userMessage: null,
      assistantMessage: null,
      error: calmProviderUnavailableMessage(provider),
    };
  }

  logProviderRoute({
    route: "stream",
    provider,
    model,
    threadId,
    workspaceId,
  });
  const visibleContentForPersistence =
    typeof input.visibleContent === "string" && input.visibleContent.trim().length > 0
      ? input.visibleContent.trim()
      : content;


  const historyPage = listMessagesPage(db, threadId, {
    limit: DEFAULT_CONTEXT_MESSAGE_LIMIT,
  }).messages;
  const createdUserMessage = insertMessage(db, {
    threadId,
    role: "user",
    content: visibleContentForPersistence,
    messageStatus: "completed",
  });
  userMessage = createdUserMessage;
  
  const modelContextUserMessage = {
    ...createdUserMessage,
    content,
  };
const history = historyPage.some((message) => message.id === createdUserMessage.id)
    ? historyPage.map((message) => message.id === createdUserMessage.id ? modelContextUserMessage : message)
    : [...historyPage.slice(-(DEFAULT_CONTEXT_MESSAGE_LIMIT - 1)), modelContextUserMessage];
  const ws = getWorkspaceById(db, workspaceId);
  const importedState = getLatestAppliedContinuityImport(db, workspaceId);
  const memoryState = getMemoryState(db, workspaceId, threadId);
  const relevantFragments = listRelevantMemoryFragments(db, {
    workspaceId,
    threadId,
    query: visibleContentForPersistence,
  });
  const feelingBlock = buildContinuityFeelingBlock({
    state: memoryState,
    fragments: relevantFragments,
  });
  const reconstruction = scoreContinuityReconstruction(db, {
    workspaceId,
    threadId,
    query: visibleContentForPersistence,
  });
  const validationSnapshotId = persistContinuityValidationSnapshot(db, {
    workspaceId,
    threadId,
    reconstruction,
  });
  const calibrationSnapshotId = persistCalibrationSnapshot(db, {
    workspaceId,
    threadId,
    reconstruction,
  });
  const lowConfidenceMode =
    reconstruction.needsCorrection ||
    reconstruction.continuityConfidenceScore < 0.6 ||
    reconstruction.continuityReconstructionHealth < 0.45;
  const adjustedFragments = lowConfidenceMode ? relevantFragments.slice(0, 2) : relevantFragments;
  const adjustedFeelingBlock = lowConfidenceMode ? null : feelingBlock;
  const assistantProfile = getAssistantProfile(db);
  const assistantIdentityPrompt = buildAssistantIdentityPromptForProfile(assistantProfile, {
    providerId: provider,
    modelName: model,
  });
  const webContextBlock = await buildWebContextBlock(db, content);
  const awareness = buildConversationAwarenessContext(db, {
    workspaceId,
    threadId,
    currentMessage: visibleContentForPersistence,
    recentMessages: history,
    workspaceName: ws?.name ?? "Workspace",
    continuitySummary: ws?.continuitySummary ?? null,
  });
  const { messages: contextMessages, estimatedTokens } = assembleProviderContext({
    workspaceName: ws?.name ?? "Workspace",
    assistantIdentityPrompt,
    awarenessContextBlock: awareness.awarenessBlock,
    aiLifeAwarenessBlock: awareness.aiLifeBlock,
    continuityIntelligenceBlock: awareness.continuityIntelligenceBlock,
    continuitySummary: ws?.continuitySummary ?? null,
    importedContextBlock: buildImportedStateContextBlock(importedState),
    memoryStateBlock: awareness.suppressLegacyMemory ? null : buildMemoryStateContextBlock(memoryState),
    relevantFragmentsBlock: awareness.suppressLegacyMemory
      ? null
      : buildRelevantFragmentsContextBlock(adjustedFragments),
    continuityFeelingBlock: awareness.suppressLegacyMemory ? null : adjustedFeelingBlock,
    webContextBlock,
    messages: history,
  });
  const providerContextBudget = provider === "ollama" ? 3_500 : 128_000;

  if (process.env.NODE_ENV !== "production") {
    console.info("[stream-runtime] context budget", {
      provider,
      model,
      estimatedTokens,
      providerContextBudget,
    });
  }

  const truncated = applyContextTruncation(contextMessages, providerContextBudget);
  const providerCapability = getProviderCapabilityMetadata(provider);
  const normalizedContext = normalizeProviderContext(provider, truncated);

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
  registerAdapterStreamAbort(streamId, provider, abortController);

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
  if (reconstruction.needsCorrection) {
    appendTimelineEvent(db, {
      workspaceId,
      threadId,
      type: "assistant_response_failed",
      title: "Continuity drift warning",
      description: `drift=${reconstruction.continuityDriftScore.toFixed(
        3,
      )} threshold=${reconstruction.driftWarningThreshold.toFixed(
        3,
      )} validation=${validationSnapshotId} calibration=${calibrationSnapshotId}`,
      source: "system",
    });
  }

  setTimeout(() => {
    void runStream({
      db,
      sender,
      streamId,
      adapter,
      connectionValue,
      model,
      provider,
      requestBaseUrl,
      contextMessages: normalizedContext,
      session: activeStreams.get(streamId)!,
      maxContextHintTokens: providerCapability.maxContextHintTokens,
    });
  }, 25);

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
  requestBaseUrl: string | null;
  contextMessages: ReturnType<typeof assembleProviderContext>["messages"];
  session: ActiveStream;
  maxContextHintTokens: number;
}): Promise<void> {
  const {
    db,
    sender,
    streamId,
    adapter,
    connectionValue,
    model,
    provider,
    requestBaseUrl,
    contextMessages,
    session,
    maxContextHintTokens,
  } = args;

  await adapter.streamMessage(
    { model, messages: contextMessages, baseUrl: requestBaseUrl },
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
          if (result.content.length > maxContextHintTokens * 4) {
            appendTimelineEvent(db, {
              workspaceId: session.workspaceId,
              threadId: session.threadId,
              type: "assistant_response_failed",
              title: "Continuity context warning",
              description:
                "Response size exceeded provider context hint; continuity context may need compression.",
              source: "system",
            });
          }
        });

        activeStreams.delete(streamId);
        unregisterAdapterStreamAbort(streamId, provider);

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
            logProviderRoute({
              route: "error",
              provider,
              model,
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
        unregisterAdapterStreamAbort(streamId, provider);

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

