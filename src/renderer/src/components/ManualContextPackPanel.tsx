import { useEffect, useRef, useState } from "react";
import type { Message, Thread, UniversalContextPackResult } from "@shared/types";
import type { ManualFallbackKind } from "../manual-fallback";

type Props = {
  thread: Thread | null;
  latestUserMessage: Message | null;
  disabled: boolean;
  streaming: boolean;
  fallbackKind: ManualFallbackKind;
  highlighted?: boolean;
  autoOpenSignal?: string | null;
  pasteFocusSignal?: number;
  onBuildPack: (input: {
    userRequest: string;
    targetPlatform: string;
  }) => Promise<UniversalContextPackResult>;
  onSaveAssistantResponse: (input: {
    assistantResponse: string;
    targetPlatform: string;
    sourceUserMessageId?: string;
  }) => Promise<void>;
};

const TARGET_OPTIONS = [
  "Any AI",
  "ChatGPT",
  "Claude",
  "Gemini",
  "OpenRouter",
  "Ollama",
] as const;

export function ManualContextPackPanel({
  thread,
  latestUserMessage,
  disabled,
  streaming,
  fallbackKind,
  highlighted,
  autoOpenSignal,
  pasteFocusSignal,
  onBuildPack,
  onSaveAssistantResponse,
}: Props) {
  const [targetPlatform, setTargetPlatform] = useState<string>("Any AI");
  const [pack, setPack] = useState<UniversalContextPackResult | null>(null);
  const [assistantResponse, setAssistantResponse] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const assistantResponseRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setPack(null);
    setAssistantResponse("");
    setError(null);
    setStatus(null);
    setExpanded(false);
    setShowPreview(false);
  }, [thread?.id, latestUserMessage?.id, targetPlatform]);

  useEffect(() => {
    if (autoOpenSignal && latestUserMessage?.id === autoOpenSignal) {
      setExpanded(true);
    }
  }, [autoOpenSignal, latestUserMessage?.id]);

  useEffect(() => {
    if (!pasteFocusSignal) return;
    setExpanded(true);
    window.setTimeout(() => assistantResponseRef.current?.focus(), 0);
  }, [pasteFocusSignal]);

  const activeRequest = latestUserMessage?.content.trim() ?? "";
  const introCopy =
    fallbackKind === "provider-unavailable"
      ? "Message saved locally. Provider unavailable, but ContinuityOS prepared a Context Pack so you can continue in ChatGPT, Claude, Gemini, or another AI."
      : "Message saved locally. No AI provider is connected, so ContinuityOS prepared a Context Pack for ChatGPT, Claude, Gemini, or another AI.";

  const buildPack = async (): Promise<UniversalContextPackResult> => {
    const built = await onBuildPack({
      userRequest: activeRequest,
      targetPlatform,
    });
    setPack(built);
    return built;
  };

  const handleBuild = async () => {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const built = await buildPack();
      setPack(built);
      setStatus(`Preview ready for ${built.targetPlatform}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not build Context Pack.");
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = async () => {
    try {
      setBusy(true);
      setError(null);
      const built = pack ?? (await buildPack());
      await navigator.clipboard.writeText(built.text);
      setStatus(`Copied Context Pack for ${built.targetPlatform}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Clipboard copy failed.");
    } finally {
      setBusy(false);
    }
  };

  const handleSave = async () => {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      await onSaveAssistantResponse({
        assistantResponse,
        targetPlatform,
        sourceUserMessageId: latestUserMessage?.id,
      });
      setAssistantResponse("");
      setPack(null);
      setStatus(`Saved pasted ${targetPlatform} response into this thread.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save manual exchange.");
    } finally {
      setBusy(false);
    }
  };

  const handleTogglePreview = async () => {
    const next = !showPreview;
    if (next) {
      setExpanded(true);
    }
    setShowPreview(next);
    if (next && !pack) {
      await handleBuild();
    }
  };

  if (!thread || !latestUserMessage) {
    return null;
  }

  return (
    <section className="manual-context-pack" aria-label="Universal Context Pack">
      <div
        className={`manual-context-pack-header compact${highlighted ? " highlighted" : ""}`}
      >
        <div>
          <h3>Continue in Any AI</h3>
          <p className="muted small">
            {introCopy}
          </p>
          <p className="muted small">
            ContinuityOS does not send this automatically. You choose what to copy.
          </p>
          <p className="muted small">
            Need to bring state back from an existing AI chat? Open Project tools and use
            Markdown Memory Files.
          </p>
        </div>
        <button
          type="button"
          className="secondary small-btn"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "Hide" : "Open"}
        </button>
      </div>

      <p className="muted small manual-context-pack-request">
        Using latest saved message: <span className="mono">{activeRequest}</span>
      </p>

      <label className="manual-context-pack-field">
        <span>Target platform</span>
        <select
          value={targetPlatform}
          onChange={(e) => setTargetPlatform(e.target.value)}
          disabled={disabled || streaming}
        >
          {TARGET_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>

      <div className="manual-context-pack-actions">
        <button
          type="button"
          className="secondary"
          disabled={disabled || streaming || busy || !activeRequest}
          onClick={() => void handleCopy()}
        >
          {busy ? "Preparing…" : "Copy Context Pack"}
        </button>
        <button
          type="button"
          className="secondary"
          disabled={disabled || streaming || busy || !activeRequest}
          onClick={() => void handleTogglePreview()}
        >
          {showPreview ? "Hide Context Pack Preview" : "Show Context Pack Preview"}
        </button>
      </div>

      {expanded && (
        <>
          {showPreview && pack && (
            <>
              <label className="manual-context-pack-field">
                <span>Context Pack preview</span>
                <textarea
                  className="manual-context-pack-preview"
                  readOnly
                  value={pack.text}
                  rows={14}
                />
              </label>
              <p className="muted small">
                Includes {pack.includedRecentMessageCount} recent saved messages.
                {pack.truncatedOlderMessages ? " Older history was omitted for size." : ""}
              </p>
            </>
          )}

          <label className="manual-context-pack-field">
            <span>Paste AI response back here</span>
            <textarea
              ref={assistantResponseRef}
              value={assistantResponse}
              onChange={(e) => setAssistantResponse(e.target.value)}
              rows={6}
              disabled={disabled || busy}
              placeholder="Paste the response from ChatGPT, Claude, Gemini, OpenRouter, Ollama, or another AI."
            />
          </label>

          <button
            type="button"
            disabled={disabled || busy || !assistantResponse.trim()}
            onClick={() => void handleSave()}
          >
            {busy ? "Saving…" : "Save Response"}
          </button>
        </>
      )}

      {status && <p className="muted small">{status}</p>}
      {error && <p className="stream-error">{error}</p>}
    </section>
  );
}
