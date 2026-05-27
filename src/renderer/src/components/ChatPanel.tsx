import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type {
  ContinuityImportApplyResult,
  EmbeddedLocalLlmStatus,
  LocalAiStatus,
  MemoryCompressionDraft,
  Message,
  Thread,
  UniversalContextPackResult,
} from "@shared/types";
import { ChatWorkflowPanel } from "./ChatWorkflowPanel";
import type { ManualFallbackState } from "../manual-fallback";
import type { GuidanceActionId, GuidanceCard } from "../guided-routines";
import {
  getContextPackRequestHint,
  routeChatIntent,
  type ActiveChatWorkflow,
  type ChatWorkflowSession,
} from "../chat-workflows";
import { getChatBubblePresentation, shouldShowGuideBubble } from "../chat-surface";

type Props = {
  thread: Thread | null;
  workspaceId: string | null;
  workspaceName: string | null;
  continuitySummary: string | null;
  messages: Message[];
  totalCount: number;
  hasMoreOlder: boolean;
  loadingOlder: boolean;
  switching?: boolean;
  onLoadOlder: () => void;
  providerReady: boolean;
  providerLabel: string | null;
  modelBadge: string | null;
  streaming: boolean;
  streamError: string | null;
  manualFallback: ManualFallbackState | null;
  onSend: (content: string) => Promise<void>;
  onBuildContextPack: (input: {
    userRequest: string;
    targetPlatform: string;
  }) => Promise<UniversalContextPackResult>;
  onSaveManualAssistantResponse: (input: {
    assistantResponse: string;
    targetPlatform: string;
    sourceUserMessageId?: string;
  }) => Promise<void>;
  onCancelStream: () => void;
  guidanceCard: GuidanceCard;
  hasConversationalGuide: boolean;
  chatWorkflow: ChatWorkflowSession;
  chatWorkflowTick: number;
  contextPackRequestHint: string;
  onGuideAction: (action: GuidanceActionId) => void;
  onOpenWorkflow: (
    workflow: ActiveChatWorkflow,
    options?: Partial<Omit<ChatWorkflowSession, "kind">>,
  ) => void;
  onCloseWorkflow: () => void;
  onOpenProjectTools: (
    target: "import-memory" | "review-memory" | "backup-export" | "memory-update" | "local-ai",
  ) => void;
  onApplyContinuityImport: (input: {
    text: string;
    mode: "update-current" | "create-workspace" | "checkpoint-only";
  }) => Promise<ContinuityImportApplyResult>;
  onContextPackCopied: () => void;
  onManualResponseSaved: () => void;
  onRefreshLocalAiStatus: () => Promise<LocalAiStatus | null>;
  onRefreshEmbeddedLocalAiStatus: () => Promise<EmbeddedLocalLlmStatus | null>;
  onPreviewMemoryCompression: () => Promise<MemoryCompressionDraft>;
  onUseLocalAi: (input: {
    model: string;
    baseUrl: string;
  }) => Promise<LocalAiStatus | null>;
  disabled: boolean;
};

export function ChatPanel({
  thread,
  workspaceId,
  workspaceName,
  continuitySummary,
  messages,
  totalCount,
  hasMoreOlder,
  loadingOlder,
  switching,
  onLoadOlder,
  providerReady,
  providerLabel,
  modelBadge,
  streaming,
  streamError,
  manualFallback,
  onSend,
  onBuildContextPack,
  onSaveManualAssistantResponse,
  onCancelStream,
  guidanceCard,
  hasConversationalGuide,
  chatWorkflow,
  chatWorkflowTick,
  contextPackRequestHint,
  onGuideAction,
  onOpenWorkflow,
  onCloseWorkflow,
  onOpenProjectTools,
  onApplyContinuityImport,
  onContextPackCopied,
  onManualResponseSaved,
  onRefreshLocalAiStatus,
  onRefreshEmbeddedLocalAiStatus,
  onPreviewMemoryCompression,
  onUseLocalAi,
  disabled,
}: Props) {
  const safeMessages = messages ?? [];
  const [draft, setDraft] = useState("");
  const [guideStatus, setGuideStatus] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const scrollSnapshotRef = useRef<{ height: number; top: number } | null>(null);
  const prevMessageCountRef = useRef(safeMessages.length);
  const prevThreadIdRef = useRef(thread?.id ?? null);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;

    const threadChanged = thread?.id !== prevThreadIdRef.current;
    prevThreadIdRef.current = thread?.id ?? null;

    if (scrollSnapshotRef.current) {
      const snap = scrollSnapshotRef.current;
      el.scrollTop = el.scrollHeight - snap.height + snap.top;
      scrollSnapshotRef.current = null;
      prevMessageCountRef.current = safeMessages.length;
      return;
    }

    const grewAtEnd =
      safeMessages.length > prevMessageCountRef.current || threadChanged || streaming;
    prevMessageCountRef.current = safeMessages.length;

    if (grewAtEnd || threadChanged) {
      el.scrollTop = el.scrollHeight;
    }
  }, [safeMessages, streaming, thread?.id]);

  const handleLoadOlder = () => {
    const el = listRef.current;
    if (el) {
      scrollSnapshotRef.current = {
        height: el.scrollHeight,
        top: el.scrollTop,
      };
    }
    onLoadOlder();
  };

  const submit = async () => {
    const text = draft.trim();
    if (!text || !thread || disabled || streaming) return;
    setDraft("");
    setGuideStatus(null);
    requestAnimationFrame(resizeComposer);
    await onSend(text);
  };

  const latestUserMessage = useMemo(
    () => [...safeMessages].reverse().find((message) => message.role === "user") ?? null,
    [safeMessages],
  );
  const latestContextMessage = useMemo(
    () =>
      [...safeMessages]
        .reverse()
        .find(
          (message) =>
            message.role === "user" &&
            message.content.trim().length > 0 &&
            routeChatIntent(message.content, guidanceCard.state).kind === "none",
        ) ?? null,
    [guidanceCard.state, safeMessages],
  );
  const activeRequest = getContextPackRequestHint({
    explicitRequestText:
      chatWorkflow.requestText ??
      latestContextMessage?.content ??
      contextPackRequestHint,
  });
  const visibleMessages = safeMessages.filter(
    (message) =>
      !(
        message.role === "assistant" &&
        !message.content.trim() &&
        (message.messageStatus === "failed" || message.messageStatus === "cancelled")
      ),
  );
  const showManualFallback =
    thread != null &&
    latestUserMessage != null &&
    manualFallback?.threadId === thread.id &&
    manualFallback.sourceMessageId === latestUserMessage.id;
  const showGuideCard = shouldShowGuideBubble({
    threadPresent: thread != null,
    chatWorkflowKind: chatWorkflow.kind,
    guidanceState: guidanceCard.state,
    hasConversationalGuide,
    hasManualFallback: showManualFallback,
    hasStreamError: streamError != null,
  });

  const resizeComposer = () => {
    const el = composerRef.current;
    if (!el) return;
    el.style.height = "auto";
    const next = Math.min(180, Math.max(72, el.scrollHeight));
    el.style.height = `${next}px`;
  };

  useEffect(() => {
    resizeComposer();
  }, [draft, thread?.id]);

  const handleComposerKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  };

  const handleDraftChange = (value: string) => {
    setDraft(value);
    requestAnimationFrame(resizeComposer);
  };

  const handleCopyContextPack = async () => {
    if (!thread || !activeRequest) return;
    try {
      setGuideStatus(null);
      const pack = await onBuildContextPack({
        userRequest: activeRequest,
        targetPlatform: "AI Handoff",
      });
      await navigator.clipboard.writeText(pack.text);
      setGuideStatus(
        "Advanced handoff copied. Paste it into the external AI chat you want to use, then paste the reply back here.",
      );
      onContextPackCopied();
      onOpenWorkflow("paste_ai_response", {
        sourceUserMessageId: latestUserMessage?.id ?? null,
        requestText: activeRequest,
      });
    } catch (error) {
      setGuideStatus(
        error instanceof Error ? error.message : "Could not copy the advanced handoff.",
      );
    }
  };

  const handleGuideButton = (action: GuidanceActionId) => {
    if (action === "copy_context_pack") {
      void handleCopyContextPack();
      return;
    }
    if (action === "continue_any_ai") {
      onOpenWorkflow("continue_any_ai", { requestText: activeRequest });
      setGuideStatus("Advanced AI handoff is ready in chat.");
      return;
    }
    if (action === "show_context_pack_again") {
      onOpenWorkflow("continue_any_ai", { requestText: activeRequest });
      setGuideStatus("Advanced handoff preview opened in chat.");
      return;
    }
    if (action === "paste_ai_response") {
      onOpenWorkflow("paste_ai_response", {
        sourceUserMessageId: latestUserMessage?.id ?? null,
        requestText: activeRequest,
      });
      setGuideStatus("Paste the AI response into the in-chat workflow below.");
      return;
    }
    if (action === "continue_chatting") {
      onCloseWorkflow();
      composerRef.current?.focus();
      setGuideStatus("Composer focused. Keep chatting when you are ready.");
      return;
    }
    onGuideAction(action);
  };

  return (
    <section className="chat-panel">
      {providerLabel && (
        <div className="provider-bar">
          <span>{providerLabel}</span>
          {streaming && <span className="streaming-badge">Streaming…</span>}
        </div>
      )}

      {streamError && (
        <div className="stream-error" role="alert">
          {streamError}
        </div>
      )}

      <div className={`message-list${switching ? " is-switching" : ""}`} ref={listRef}>
        {!thread && (
          <div className="chat-empty-state">
            <p className="muted">Create a thread to begin your continuity workspace.</p>
            <p className="muted small">Shortcut: Ctrl+N</p>
          </div>
        )}
        {thread && switching && <p className="muted switching-hint">Loading thread…</p>}
        {thread && hasMoreOlder && (
          <div className="load-older-row">
            <button
              type="button"
              className="load-older"
              disabled={loadingOlder || disabled}
              onClick={handleLoadOlder}
            >
              {loadingOlder
                ? "Loading earlier messages…"
                : `Load earlier messages (${safeMessages.length} of ${totalCount})`}
            </button>
          </div>
        )}
        {thread && visibleMessages.length === 0 && !streaming && (
          <div className="chat-empty-state">
            <h3>Ask me anything about this project.</h3>
            <p className="muted">
              ContinuityOS saves this conversation locally and keeps compressed memory so future
              chats can continue.
            </p>
            <div className="chat-empty-actions">
              <button
                type="button"
                className="small-btn"
                onClick={() => handleGuideButton("set_up_local_ai")}
              >
                Set Up Ollama
              </button>
              <button
                type="button"
                className="secondary small-btn"
                onClick={() => handleGuideButton("import_memory")}
              >
                Import Memory
              </button>
              <button
                type="button"
                className="secondary small-btn"
                onClick={() => handleGuideButton("review_project_memory")}
              >
                Review Memory
              </button>
            </div>
          </div>
        )}
        {visibleMessages.map((m) => {
          const presentation = getChatBubblePresentation({
            role: m.role,
            provider: m.provider,
          });

          return (
            <div key={m.id} className={`message-row ${presentation.rowClass}`}>
              <article className={`message-bubble message-${presentation.rowClass}`}>
                <div className="message-meta">
                  <span>{presentation.label}</span>
                  {m.model && <span className="model-tag">{m.model}</span>}
                  <time>{new Date(m.createdAt).toLocaleString()}</time>
                </div>
                <div className="message-content">
                  {m.content || (streaming && m.role === "assistant" ? "…" : "")}
                </div>
              </article>
            </div>
          );
        })}
        {thread && showGuideCard && (
          <div className="message-row guide">
            <article className="message-bubble message-guide compact-guide-bubble" aria-live="polite">
              <div className="message-meta">
                <span>ContinuityOS Guide</span>
                <span className="local-guidance-badge">Local guidance</span>
              </div>
              <h3 className="guide-card-title">{guidanceCard.title}</h3>
              <div className="message-content">{guidanceCard.body}</div>
              {guidanceCard.footer && <p className="muted small">{guidanceCard.footer}</p>}
              <div className="message-guidance-actions">
                {guidanceCard.actions.map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    className={action.tone === "primary" ? "small-btn" : "secondary small-btn"}
                    onClick={() => handleGuideButton(action.id)}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
              {guideStatus && <p className="muted small">{guideStatus}</p>}
            </article>
          </div>
        )}
        {thread && chatWorkflow.kind !== "none" && (
          <div className="message-row guide">
            <ChatWorkflowPanel
              workflow={chatWorkflow}
              workflowTick={chatWorkflowTick}
              workspaceId={workspaceId}
              workspaceName={workspaceName}
              threadId={thread?.id ?? null}
              latestUserMessage={latestUserMessage}
              continuitySummary={continuitySummary}
              requestTextHint={contextPackRequestHint}
              disabled={disabled}
              streaming={streaming}
              onClose={onCloseWorkflow}
              onOpenWorkflow={onOpenWorkflow}
              onOpenProjectTools={onOpenProjectTools}
              onApplyContinuityImport={onApplyContinuityImport}
              onBuildContextPack={onBuildContextPack}
              onSaveManualAssistantResponse={onSaveManualAssistantResponse}
              onContextPackCopied={onContextPackCopied}
              onManualResponseSaved={onManualResponseSaved}
              onRefreshLocalAiStatus={onRefreshLocalAiStatus}
              onRefreshEmbeddedLocalAiStatus={onRefreshEmbeddedLocalAiStatus}
              onPreviewMemoryCompression={onPreviewMemoryCompression}
              onUseLocalAi={onUseLocalAi}
            />
          </div>
        )}
      </div>

      <div className="chat-composer-shell">
        <form
          className="chat-composer-inner"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          {modelBadge && (
            <p className="chat-composer-meta muted small" aria-label="Active model">
              Model: <span className="mono">{modelBadge}</span>
            </p>
          )}
          <div className="chat-composer-row">
            <textarea
              ref={composerRef}
              className="chat-input"
              value={draft}
              onChange={(e) => handleDraftChange(e.target.value)}
              onKeyDown={handleComposerKeyDown}
              placeholder={thread ? "Ask anything about this project…" : "Select a thread first"}
              disabled={!thread || disabled || streaming}
              rows={3}
            />
            {streaming ? (
              <button
                type="button"
                className="chat-send-button cancel"
                onClick={onCancelStream}
              >
                Cancel
              </button>
            ) : (
              <button
                type="submit"
                className="chat-send-button"
                disabled={!thread || disabled || !draft.trim()}
              >
                Send
              </button>
            )}
          </div>
          <p className="muted small chat-composer-hint">
            Chat with Ollama. ContinuityOS saves and compresses memory in the background.
          </p>
        </form>
      </div>
    </section>
  );
}
