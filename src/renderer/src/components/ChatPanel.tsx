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
import { ManualContextPackPanel } from "./ManualContextPackPanel";
import { ChatWorkflowPanel } from "./ChatWorkflowPanel";
import type { ManualFallbackState } from "../manual-fallback";
import type { GuidanceActionId, GuidanceCard } from "../guided-routines";
import {
  getContextPackRequestHint,
  routeChatIntent,
  type ActiveChatWorkflow,
  type ChatWorkflowSession,
} from "../chat-workflows";

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
  guidanceTick: number;
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
  guidanceTick,
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
  const [manualPanelOpenSignal, setManualPanelOpenSignal] = useState(0);
  const [manualPanelPreviewSignal, setManualPanelPreviewSignal] = useState(0);
  const [pasteFocusSignal, setPasteFocusSignal] = useState(0);
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
  const showManualContextPack =
    thread != null &&
    activeRequest.length > 0 &&
    chatWorkflow.kind === "none" &&
    (!providerReady ||
      showManualFallback ||
      guidanceCard.state === "memory_imported" ||
      guidanceCard.state === "context_pack_ready" ||
      guidanceCard.state === "context_pack_copied" ||
      guidanceCard.state === "response_saved");

  const handleComposerKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  };

  const handleCopyContextPack = async () => {
    if (!thread || !activeRequest) return;
    try {
      setGuideStatus(null);
      const pack = await onBuildContextPack({
        userRequest: activeRequest,
        targetPlatform: "Any AI",
      });
      await navigator.clipboard.writeText(pack.text);
      setGuideStatus(
        "Context Pack copied. Paste it into ChatGPT, Claude, Gemini, Ollama, or another AI, then paste the reply back here.",
      );
      onContextPackCopied();
      onOpenWorkflow("paste_ai_response", {
        sourceUserMessageId: latestUserMessage?.id ?? null,
        requestText: activeRequest,
      });
    } catch (error) {
      setGuideStatus(
        error instanceof Error ? error.message : "Could not copy the Context Pack.",
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
      setGuideStatus("Continue in Any AI is ready in chat.");
      return;
    }
    if (action === "show_context_pack_again") {
      onOpenWorkflow("continue_any_ai", { requestText: activeRequest });
      setGuideStatus("Context Pack preview opened in chat.");
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

  useEffect(() => {
    if (guidanceCard.state === "memory_imported") {
      setManualPanelOpenSignal((value) => value + 1);
    }
    if (guidanceCard.state === "context_pack_copied") {
      setManualPanelOpenSignal((value) => value + 1);
      setPasteFocusSignal((value) => value + 1);
    }
  }, [guidanceCard.state, guidanceTick]);

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
          <div className="empty-state">
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
          <div className="empty-state">
            <p className="muted">
              Start by typing a message, importing memory from another AI chat, or copying a
              Context Pack to continue elsewhere.
            </p>
          </div>
        )}
        {visibleMessages.map((m) => (
          <article key={m.id} className={`message message-${m.role}`}>
            <header>
              <span>{m.role}</span>
              {m.model && <span className="model-tag">{m.model}</span>}
              <time>{new Date(m.createdAt).toLocaleString()}</time>
            </header>
            <p>{m.content || (streaming && m.role === "assistant" ? "…" : "")}</p>
          </article>
        ))}
        {thread && (
          <article className="message message-local-guide" aria-live="polite">
            <header>
              <span>ContinuityOS Guide</span>
              <span className="local-guidance-badge">Local guidance</span>
            </header>
            <h3 className="guide-card-title">{guidanceCard.title}</h3>
            <p>{guidanceCard.body}</p>
            {guidanceCard.footer && <p className="muted small">{guidanceCard.footer}</p>}
            <div className="message-guidance-actions">
              {guidanceCard.actions.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  className={
                    action.tone === "primary" ? "small-btn" : "secondary small-btn"
                  }
                  onClick={() => handleGuideButton(action.id)}
                >
                  {action.label}
                </button>
              ))}
            </div>
            {guideStatus && <p className="muted small">{guideStatus}</p>}
          </article>
        )}
        {thread && chatWorkflow.kind !== "none" && (
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
        )}
      </div>

      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {modelBadge && (
          <p className="composer-model-badge muted small" aria-label="Active model">
            Model: <span className="mono">{modelBadge}</span>
          </p>
        )}
        <textarea
          ref={composerRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleComposerKeyDown}
          placeholder={thread ? "Message your workspace…" : "Select a thread first"}
          disabled={!thread || disabled || streaming}
          rows={3}
        />
        {streaming ? (
          <button type="button" className="cancel" onClick={onCancelStream}>
            Cancel
          </button>
        ) : (
          <button
            type="submit"
            disabled={!thread || disabled || !draft.trim()}
          >
            Send
          </button>
        )}
        <p className="muted small composer-manual-hint">
          Send saves your message locally. If no local engine is active, ContinuityOS will guide
          you to Ollama, Built-in Local AI, or a Context Pack fallback.
        </p>
      </form>
      {showManualContextPack && (
        <div className="manual-context-pack-wrap">
          <ManualContextPackPanel
            thread={thread}
            latestUserMessage={latestContextMessage}
            requestText={activeRequest}
            disabled={disabled}
            streaming={streaming}
            fallbackKind={manualFallback?.kind ?? "no-provider"}
            highlighted={showManualFallback}
            openSignal={manualPanelOpenSignal}
            previewSignal={manualPanelPreviewSignal}
            pasteFocusSignal={pasteFocusSignal}
            onBuildPack={onBuildContextPack}
            onSaveAssistantResponse={onSaveManualAssistantResponse}
            onContextPackCopied={onContextPackCopied}
            onAssistantResponseSaved={onManualResponseSaved}
          />
        </div>
      )}
    </section>
  );
}
