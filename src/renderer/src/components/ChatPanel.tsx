import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent as ReactChangeEvent,
  type ClipboardEvent as ReactClipboardEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import type {
  AutosaveStatus,
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
import { ManualContextPackPanel } from "./ManualContextPackPanel";
import { resolveComposerHint, shouldShowManualContextPack } from "@shared/startup-flow";
import {
  buildChatWelcomeHeading,
  CHAT_EMPTY_THREAD_BODY,
  CHAT_NO_THREAD_BODY,
  CHAT_WELCOME_PROMPT,
} from "@shared/consumer-experience-copy";
import type { ManualFallbackKind } from "../manual-fallback";

type ComposerAttachment = {
  id: string;
  name: string;
  size: number;
  type: string;
  previewUrl: string;
};

type Props = {
  thread: Thread | null;
  assistantName?: string | null;
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
  providerSetupRequired?: boolean;
  providerLabel: string | null;
  modelBadge: string | null;
  streaming: boolean;
  streamError: string | null;
  manualFallback: ManualFallbackState | null;
  onSend: (content: string) => Promise<void>;
  onRestoreSavePoint?: (input: { name: string; markdown: string }) => Promise<void>;
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
  onConnectAi?: () => void;
  autosaveStatus?: AutosaveStatus | null;
  consumerStatusMessage?: string | null;
  disabled: boolean;
};

export function ChatPanel({
  thread,
  assistantName,
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
  providerSetupRequired = false,
  providerLabel,
  modelBadge,
  streaming,
  streamError,
  manualFallback,
  onSend,
  onRestoreSavePoint,
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
  onConnectAi,
  autosaveStatus,
  consumerStatusMessage = null,
  disabled,
}: Props) {
  const safeMessages = messages ?? [];
  const isHiddenInfrastructureMessage = (message: Message) => {
    const content = message.content.trim();
    return (
      content.startsWith("# RESTORED_MEMORY_PIN") ||
      content.startsWith("# RESTORED_CONTINUITYOS_SAVE_POINT")
    );
  };
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const [guideStatus, setGuideStatus] = useState<string | null>(null);
  const [optimisticThinking, setOptimisticThinking] = useState(false);
  const [continuityModal, setContinuityModal] = useState<null | "import" | "export" | "savepoint">(null);
  const [savePointName, setSavePointName] = useState(`Save point - ${new Date().toLocaleString()}`);
  const [localSavePoints, setLocalSavePoints] = useState<Array<{ id: string; name: string; createdAt: string; markdown: string }>>(() => {
    try {
      return JSON.parse(localStorage.getItem("polaris-save-points") ?? "[]");
    } catch {
      return [];
    }
  });
  const listRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollSnapshotRef = useRef<{ height: number; top: number } | null>(null);
  const prevMessageCountRef = useRef(safeMessages.length);
  const prevThreadIdRef = useRef(thread?.id ?? null);
  const showThinking = streaming || optimisticThinking;

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
    const hasAttachments = attachments.length > 0;

    if ((!text && !hasAttachments) || !thread || disabled || streaming) return;

    const imageNote = hasAttachments
      ? attachments
          .map((attachment) => `[Attached image: ${attachment.name}]`)
          .join("\n")
      : "";

    const messageText = [text || "Image attached.", imageNote]
      .filter(Boolean)
      .join("\n\n");

    const attachmentsToRelease = attachments;

    setDraft("");
    setAttachments([]);
    setGuideStatus(null);
    requestAnimationFrame(resizeComposer);

    attachmentsToRelease.forEach((attachment) => {
      URL.revokeObjectURL(attachment.previewUrl);
    });

    setOptimisticThinking(true);
    try {
      await onSend(messageText);
    } finally {
      setOptimisticThinking(false);
    }
  };

  const copyContinuityText = async (text: string, status: string) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setGuideStatus(status);
        return;
      }
    } catch {
      // Fall back below for Electron/Chromium contexts where navigator.clipboard is blocked.
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    try {
      const copied = document.execCommand("copy");
      setGuideStatus(copied ? status : "Copy failed. Select the text preview and press Ctrl+C.");
    } catch {
      setGuideStatus("Copy failed. Select the text preview and press Ctrl+C.");
    } finally {
      document.body.removeChild(textarea);
    }
  };

  const extractionPrompt = `You are helping prepare a ContinuityOS import file.

Analyze this chat/project and return ONLY markdown in this exact structure:

# CONTINUITYOS_IMPORT
## PROJECT_NAME
## CURRENT_OBJECTIVE
## SUMMARY
## RECENT_PROGRESS
## KEY_DECISIONS
## OPEN_ISSUES
## FILES_OR_AREAS
## NEXT_STEPS
## NOTES_FOR_POLARIS

Rules:
- Do not invent missing facts.
- Use UNKNOWN when information is missing.
- Optimize for importing into ContinuityOS.
- Keep it concise but complete.`;

  const buildThreadExport = () => {
    const title = thread?.title ?? "Current thread";
    const messages = safeMessages.slice(-200).map((message) => {
      const role = message.role === "assistant" ? "Polaris" : message.role === "user" ? "User" : message.role;
      return `### ${role} - ${new Date(message.createdAt).toLocaleString()}

${message.content}`;
    });

    return [
      "# CONTINUITYOS_THREAD_EXPORT",
      `## THREAD\n${title}`,
      `## EXPORTED_AT\n${new Date().toISOString()}`,
      "## MESSAGES",
      messages.join("\n\n---\n\n") || "No messages available.",
    ].join("\n\n");
  };

  const buildContextPack = () => {
    const recent = safeMessages.slice(-60).map((message) => {
      const role = message.role === "assistant" ? "Polaris" : message.role === "user" ? "User" : message.role;
      return `- ${role}: ${message.content.replace(/\s+/g, " ").slice(0, 700)}`;
    });

    return [
      "# CONTINUITYOS_CONTEXT_PACK",
      "## SAVED_PROJECT_MEMORY",
      continuitySummary?.trim() || "No saved project memory yet.",
      "## PROJECT",
      "ContinuityOS Desktop",
      "## CURRENT_GOAL",
      "Continue the current workspace with full continuity.",
      "## SUMMARY",
      "This context pack was exported from ContinuityOS for use in another AI chat.",
      "## CURRENT_STATE",
      thread ? `Active thread: ${thread.title}` : "No active thread selected.",
      "## RECENT_CHANGES",
      recent.join("\n") || "No recent messages available.",
      "## ACTIVE_PROBLEMS",
      "Review recent messages and ask clarifying questions before assuming missing facts.",
      "## IMPORTANT_FILES",
      "UNKNOWN",
      "## DECISIONS",
      "Use the exported context as the source of continuity.",
      "## NEXT_ACTIONS",
      "Continue from the latest user goal.",
      "## INSTRUCTIONS_FOR_NEXT_AI",
      "Do not invent missing facts. Ask questions when project state is unclear. Keep responses actionable.",
    ].join("\n\n");
  };

  const sanitizeMarkdownFilename = (name: string) =>
    (name || "continuityos-save-point")
      .replace(/[^a-z0-9-_ ]/gi, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 80) || "continuityos-save-point";

  const downloadMarkdown = (name: string, markdown: string) => {
    const filename = `${sanitizeMarkdownFilename(name)}.md`;
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = filename;
    link.style.display = "none";

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setGuideStatus(`Downloaded ${filename}.`);
  };

  const restoreSavePointFile = async (file: File | null) => {
    if (!file) return;

    const markdown = await file.text();
    const name = file.name.replace(/\.md$/i, "").trim() || "Imported save point";

    setContinuityModal(null);
    setDraft("");
    setOptimisticThinking(true);
    setGuideStatus(`Restoring ${file.name} into a new thread...`);

    if (!onRestoreSavePoint) {
      setGuideStatus("Restore failed: restore handler is not connected. Please restart the app and try again.");
      console.error("[savepoint-md-restore] onRestoreSavePoint prop is missing");
      return;
    }

    try {
      await onRestoreSavePoint({ name, markdown });
      setDraft("");
      setOptimisticThinking(false);
      requestAnimationFrame(resizeComposer);
      setGuideStatus(`Restored ${file.name} into a new thread.`);
    } catch (error) {
      console.error("[savepoint-md-restore] failed", error);
      const message = error instanceof Error ? error.message : String(error);
      setOptimisticThinking(false);
      setOptimisticThinking(false);
      setGuideStatus(`Restore from .md failed: ${message}`);
    }
  };
  const createSavePoint = () => {
    const name = savePointName.trim() || `Save point - ${new Date().toLocaleString()}`;
    const markdown = [
      "# CONTINUITYOS_SAVE_POINT",
      `## NAME\n${name}`,
      `## CREATED_AT\n${new Date().toISOString()}`,
      "## SAVED_PROJECT_MEMORY",
      continuitySummary?.trim() || "No saved project memory yet.",
      `## ACTIVE_THREAD\n${thread?.title ?? "No active thread"}`,
      "## RECENT_MESSAGES",
      safeMessages
        .slice(-16)
        .map((message) => {
          const role = message.role === "assistant" ? "Polaris" : message.role === "user" ? "User" : message.role;
          return `### ${role}\n${message.content}`;
        })
        .join("\n\n---\n\n") || "No recent messages available.",
      "## NEXT_STEPS",
      "Continue from this point.",
    ].join("\n\n");

    const next = [
      { id: crypto.randomUUID(), name, createdAt: new Date().toISOString(), markdown },
      ...localSavePoints,
    ].slice(0, 25);

    setLocalSavePoints(next);
    localStorage.setItem("polaris-save-points", JSON.stringify(next));
    setGuideStatus("Save point created.");
  };

  const loadSavePointIntoComposer = (point: { name: string; markdown: string }) => {
    setDraft((prev) =>
      [
        prev.trim(),
        `Restore this ContinuityOS save point and continue from it:`,
        point.markdown,
      ]
        .filter(Boolean)
        .join("\n\n"),
    );
    setContinuityModal(null);
    requestAnimationFrame(resizeComposer);
  };

  const restoreSavePoint = async (point: { name: string; markdown: string }) => {
    setGuideStatus(`Restoring "${point.name}"...`);

    if (!onRestoreSavePoint) {
      loadSavePointIntoComposer(point);
      setGuideStatus("Save point loaded into composer. Send it to Polaris to continue from it.");
      return;
    }

    try {
      await onRestoreSavePoint({ name: point.name, markdown: point.markdown });
      setContinuityModal(null);
      setGuideStatus(`Restored "${point.name}" into a new thread.`);
    } catch (error) {
      console.error("[savepoint-restore] failed", error);
      loadSavePointIntoComposer(point);
      const message = error instanceof Error ? error.message : String(error);
      setGuideStatus(`Restore to new thread failed, so the save point was loaded into the composer. ${message}`);
    }
  };

  const importMarkdownFile = async (file: File | null) => {
    if (!file) return;
    const text = await file.text();
    setDraft((prev) =>
      [
        prev.trim(),
        "Imported ContinuityOS markdown. Please absorb this into the current workspace context:",
        text,
      ]
        .filter(Boolean)
        .join("\n\n"),
    );
    setContinuityModal(null);
    setGuideStatus("Markdown loaded into the composer. Send it to Polaris to add it to this thread.");
    requestAnimationFrame(resizeComposer);
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
      !isHiddenInfrastructureMessage(message) &&
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
  const showManualMode = shouldShowManualContextPack({
    providerReady,
    hasManualFallback: showManualFallback,
  });
  const manualFallbackKind: ManualFallbackKind =
    manualFallback?.kind ?? "no-provider";
  if (import.meta.env.DEV) {
    console.log("consumerStatusMessage debug", {
      scope: "ChatPanel",
      consumerStatusMessage,
      typeofConsumerStatusMessage: typeof consumerStatusMessage,
    });
  }
  const composerHint = resolveComposerHint({
    providerReady,
    providerSetupRequired,
    lastAutosaveAt: autosaveStatus?.lastAutosaveAt ?? null,
    consumerStatusMessage,
  });
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

  const addImageFiles = (files: FileList | File[]) => {
    const imageFiles = Array.from(files).filter((file) => file.type.startsWith("image/"));
    if (imageFiles.length === 0) return;

    setAttachments((prev) => [
      ...prev,
      ...imageFiles.map((file) => ({
        id: `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`,
        name: file.name,
        size: file.size,
        type: file.type,
        previewUrl: URL.createObjectURL(file),
      })),
    ]);

    setGuideStatus(
      "Image attached. Polaris can store the note now; visual understanding comes with the vision-model pass.",
    );
  };

  const handleAttachClick = () => {
    if (!thread || disabled || streaming) return;
    fileInputRef.current?.click();
  };

  const handleAttachmentInput = (event: ReactChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      addImageFiles(event.target.files);
    }
    event.target.value = "";
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => {
      const target = prev.find((attachment) => attachment.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((attachment) => attachment.id !== id);
    });
  };

  const handleComposerPaste = (event: ReactClipboardEvent<HTMLTextAreaElement>) => {
    const imageFiles = Array.from(event.clipboardData.files).filter((file) =>
      file.type.startsWith("image/"),
    );
    if (imageFiles.length > 0) {
      addImageFiles(imageFiles);
    }
  };

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
    if (action === "set_up_local_ai") {
      if (onConnectAi) {
        onConnectAi();
        return;
      }
      onGuideAction(action);
      return;
    }
    onGuideAction(action);
  };

  return (
    <section className="chat-panel" data-testid="chat-panel">
      <div className="chat-panel-scroll">
      {(providerLabel || !providerReady) && (
        <div className={`provider-bar${providerReady ? "" : " provider-bar-setup"}`}>
          <span>{providerLabel ? "Polaris" : "Manual Mode"}</span>
          {streaming && <span className="streaming-badge">Polaris is thinking…</span>}
        </div>
      )}

      {streamError && (
        <div className="stream-error" role="alert">
          {streamError}
        </div>
      )}

      <div className={`message-list${switching ? " is-switching" : ""}`} ref={listRef}>
        {!thread && (
          <div className="chat-empty-state" data-testid="chat-empty-no-thread">
            <h3>{buildChatWelcomeHeading(assistantName ?? "Polaris")}</h3>
            <p className="muted">{CHAT_NO_THREAD_BODY}</p>
            <p className="muted small">Shortcut: Ctrl+N for a new conversation</p>
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
        {thread && visibleMessages.length === 0 && !showThinking && (
          <div className="chat-empty-state" data-testid="chat-empty-welcome">
            <h3>{buildChatWelcomeHeading(assistantName ?? "Polaris")}</h3>
            <p className="muted">{CHAT_WELCOME_PROMPT}</p>
            <p className="muted small">{CHAT_EMPTY_THREAD_BODY}</p>
            <div className="chat-empty-actions">
              <button
                type="button"
                className="small-btn"
                onClick={() => handleGuideButton("set_up_local_ai")}
              >
                Connect AI
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
                  <span>{presentation.label === "AI" ? "Polaris" : presentation.label}</span>
                  {m.model && <span className="model-tag">Private</span>}
                  <time>{new Date(m.createdAt).toLocaleString()}</time>
                </div>
                <div className="message-content">
                  {m.content || (showThinking && m.role === "assistant" ? "Polaris is thinking…" : "")}
                </div>
              </article>
            </div>
          );
        })}
        {thread && showGuideCard && (
          <div className="message-row guide">
            <article className="message-bubble message-guide compact-guide-bubble" aria-live="polite">
              <div className="message-meta">
                <span>Polaris Guide</span>
                <span className="local-guidance-badge">Guide</span>
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

      {thread && showManualMode && (
        <ManualContextPackPanel
          thread={thread}
          latestUserMessage={latestUserMessage}
          requestText={activeRequest}
          disabled={disabled}
          streaming={streaming}
          fallbackKind={manualFallbackKind}
          highlighted={showManualFallback}
          onBuildPack={onBuildContextPack}
          onSaveAssistantResponse={onSaveManualAssistantResponse}
          onContextPackCopied={onContextPackCopied}
          onAssistantResponseSaved={onManualResponseSaved}
        />
      )}
      </div>

      {continuityModal && (
        <div
          className="modal-backdrop continuity-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setContinuityModal(null);
          }}
        >
          <div className="modal-card continuity-modal" role="dialog" aria-modal="true">
            <div className="continuity-modal-header">
              <div>
                <p className="eyebrow">ContinuityOS</p>
                <h2>
                  {continuityModal === "import"
                    ? "Import Continuity"
                    : continuityModal === "export"
                      ? "Export Continuity"
                      : "Save Point"}
                </h2>
              </div>
              <button type="button" className="small-btn" onClick={() => setContinuityModal(null)}>
                Close
              </button>
            </div>

            {continuityModal === "import" && (
              <div className="continuity-modal-body">
                <p className="muted small">
                  Copy this prompt into another AI chat, then import the returned .md file here.
                </p>
                <div className="continuity-modal-actions">
                  <button
                    type="button"
                    onClick={() => void copyContinuityText(extractionPrompt, "Extraction prompt copied.")}
                  >
                    Copy Extraction Prompt
                  </button>
                  <label className="continuity-file-button">
                    Import .md File
                    <input
                      type="file"
                      accept=".md,text/markdown,text/plain"
                      onChange={(event) => void importMarkdownFile(event.target.files?.[0] ?? null)}
                    />
                  </label>
                </div>
                <pre className="continuity-preview">{extractionPrompt}</pre>
              </div>
            )}

            {continuityModal === "export" && (
              <div className="continuity-modal-body">
                <p className="muted small">Create portable markdown for another AI chat.</p>
                <div className="continuity-modal-actions">
                  <button
                    type="button"
                    onClick={() => void copyContinuityText(buildThreadExport(), "Current thread copied.")}
                  >
                    Copy Current Thread
                  </button>
                  <button
                    type="button"
                    onClick={() => void copyContinuityText(buildContextPack(), "Context pack copied.")}
                  >
                    Copy Project Context Pack
                  </button>
                </div>
                <pre className="continuity-preview">{buildContextPack()}</pre>
              </div>
            )}

            {continuityModal === "savepoint" && (
              <div className="continuity-modal-body">
                <p className="muted small">Capture the current workspace state before making changes.</p>
                <label className="continuity-field">
                  <span>Save point name</span>
                  <input
                    value={savePointName}
                    onChange={(event) => setSavePointName(event.target.value)}
                    placeholder="Save point name"
                  />
                </label>
                <div className="continuity-modal-actions">
                  <button type="button" onClick={createSavePoint}>
                    Create Save Point
                  </button>
                  <label className="continuity-file-button">
                    Restore from .md
                    <input
                      type="file"
                      accept=".md,text/markdown,text/plain"
                      onChange={(event) => void restoreSavePointFile(event.target.files?.[0] ?? null)}
                    />
                  </label>
                </div>
                <div className="savepoint-list">
                  {localSavePoints.length === 0 ? (
                    <p className="muted small">No local save points yet.</p>
                  ) : (
                    localSavePoints.map((point) => (
                      <article className="savepoint-card" key={point.id}>
                        <div>
                          <strong>{point.name}</strong>
                          <span>{new Date(point.createdAt).toLocaleString()}</span>
                        </div>
                        <div className="savepoint-card-actions">
                          <button
                            type="button"
                            onClick={() => void restoreSavePoint(point)}
                          >
                            Restore
                          </button>
                          <button
                            type="button"
                            onClick={() => downloadMarkdown(point.name, point.markdown)}
                          >
                            Download .md
                          </button>
                          <button
                            type="button"
                            onClick={() => void copyContinuityText(point.markdown, "Save point copied.")}
                          >
                            Copy
                          </button>
                        </div>
                      </article>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="chat-composer-shell" data-testid="chat-composer-shell">
        <form
          className="chat-composer-inner"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          {modelBadge && (
            <p className="chat-composer-meta muted small" aria-label="Active model">
              Polaris is ready
            </p>
          )}
                    {attachments.length > 0 && (
            <div className="chat-attachment-tray" aria-label="Attached images">
              {attachments.map((attachment) => (
                <div className="chat-attachment-chip" key={attachment.id}>
                  <img src={attachment.previewUrl} alt="" />
                  <span title={attachment.name}>{attachment.name}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${attachment.name}`}
                    onClick={() => removeAttachment(attachment.id)}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="chat-composer-row">
                        <label
              className={`chat-attach-button ${!thread || disabled || streaming ? "is-disabled" : ""}`}
              aria-label="Attach image"
              title="Attach image"
            >
              +
              <input
                className="chat-image-input-inline"
                type="file"
                accept="image/*"
                multiple
                disabled={!thread || disabled || streaming}
                onChange={handleAttachmentInput}
              />
            </label>
            <textarea
              ref={composerRef}
              className="chat-input"
              data-testid="chat-input"
              value={draft}
              onChange={(e) => handleDraftChange(e.target.value)}
              onKeyDown={handleComposerKeyDown}
              onPaste={handleComposerPaste}
              placeholder={thread ? "Message Polaris…" : "Select a conversation first"}
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
                disabled={!thread || disabled || (!draft.trim() && attachments.length === 0)}
              >
                Send
              </button>
            )}
          </div>
          <div className="continuity-action-bar" aria-label="Continuity actions">
            <button
              type="button"
              onClick={() => setContinuityModal("import")}
            >
              Import
            </button>
            <button
              type="button"
              onClick={() => setContinuityModal("export")}
            >
              Export
            </button>
            <button
              type="button"
              onClick={() => setContinuityModal("savepoint")}
            >
              Save Point
            </button>
          </div>
          <p className="muted small chat-composer-hint">{guideStatus ?? composerHint}</p>
        </form>
      </div>
    </section>
  );
}




























