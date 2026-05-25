import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type { Message, Thread, UniversalContextPackResult } from "@shared/types";
import { ManualContextPackPanel } from "./ManualContextPackPanel";

type Props = {
  thread: Thread | null;
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
  disabled: boolean;
};

export function ChatPanel({
  thread,
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
  onSend,
  onBuildContextPack,
  onSaveManualAssistantResponse,
  onCancelStream,
  disabled,
}: Props) {
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const scrollSnapshotRef = useRef<{ height: number; top: number } | null>(null);
  const prevMessageCountRef = useRef(messages.length);
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
      prevMessageCountRef.current = messages.length;
      return;
    }

    const grewAtEnd =
      messages.length > prevMessageCountRef.current || threadChanged || streaming;
    prevMessageCountRef.current = messages.length;

    if (grewAtEnd || threadChanged) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, streaming, thread?.id]);

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
    await onSend(text);
  };

  const latestUserMessage = [...messages].reverse().find((message) => message.role === "user") ?? null;

  const handleComposerKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
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
                : `Load earlier messages (${messages.length} of ${totalCount})`}
            </button>
          </div>
        )}
        {thread && messages.length === 0 && !streaming && (
          <p className="muted">No messages yet. Say hello to your workspace.</p>
        )}
        {messages.map((m) => (
          <article key={m.id} className={`message message-${m.role}`}>
            <header>
              <span>{m.role}</span>
              {m.model && <span className="model-tag">{m.model}</span>}
              <time>{new Date(m.createdAt).toLocaleString()}</time>
            </header>
            <p>{m.content || (streaming && m.role === "assistant" ? "…" : "")}</p>
          </article>
        ))}
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
          No provider required. Send saves your message locally; use Continue in Any AI for a response.
        </p>
      </form>
      {thread && latestUserMessage && (
        <div className="manual-context-pack-wrap">
          <ManualContextPackPanel
            thread={thread}
            latestUserMessage={latestUserMessage}
            disabled={disabled}
            streaming={streaming}
            onBuildPack={onBuildContextPack}
            onSaveAssistantResponse={onSaveManualAssistantResponse}
          />
        </div>
      )}
    </section>
  );
}
