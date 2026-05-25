import { useEffect, useState } from "react";
import type { Thread, UniversalContextPackResult } from "@shared/types";

type Props = {
  thread: Thread | null;
  draft: string;
  onDraftChange: (value: string) => void;
  disabled: boolean;
  streaming: boolean;
  onBuildPack: (input: {
    userRequest: string;
    targetPlatform: string;
  }) => Promise<UniversalContextPackResult>;
  onSaveExchange: (input: {
    userRequest: string;
    assistantResponse: string;
    targetPlatform: string;
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
  draft,
  onDraftChange,
  disabled,
  streaming,
  onBuildPack,
  onSaveExchange,
}: Props) {
  const [targetPlatform, setTargetPlatform] = useState<string>("Any AI");
  const [pack, setPack] = useState<UniversalContextPackResult | null>(null);
  const [assistantResponse, setAssistantResponse] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    setPack(null);
    setAssistantResponse("");
    setError(null);
    setStatus(null);
  }, [thread?.id, draft, targetPlatform]);

  const handleBuild = async () => {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const built = await onBuildPack({
        userRequest: draft,
        targetPlatform,
      });
      setPack(built);
      setStatus(`Preview ready for ${built.targetPlatform}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not build Context Pack.");
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = async () => {
    if (!pack?.text) return;
    try {
      await navigator.clipboard.writeText(pack.text);
      setStatus(`Copied Context Pack for ${pack.targetPlatform}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Clipboard copy failed.");
    }
  };

  const handleSave = async () => {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      await onSaveExchange({
        userRequest: draft,
        assistantResponse,
        targetPlatform,
      });
      onDraftChange("");
      setAssistantResponse("");
      setPack(null);
      setStatus(`Saved pasted ${targetPlatform} response into this thread.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save manual exchange.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="manual-context-pack" aria-label="Universal Context Pack">
      <div className="manual-context-pack-header">
        <div>
          <h3>Continue in Any AI</h3>
          <p className="muted small">
            Use this when you want to continue in ChatGPT, Claude, Gemini, or
            another AI without an API key.
          </p>
          <p className="muted small">
            This does not send data automatically. You choose what to copy.
          </p>
        </div>
      </div>

      <label className="manual-context-pack-field">
        <span>Target platform</span>
        <select
          value={targetPlatform}
          onChange={(e) => setTargetPlatform(e.target.value)}
          disabled={disabled || streaming || !thread}
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
          disabled={!thread || disabled || streaming || !draft.trim() || busy}
          onClick={() => void handleBuild()}
        >
          {busy ? "Building…" : "Preview Context Pack"}
        </button>
        <button
          type="button"
          className="secondary"
          disabled={!pack?.text || busy}
          onClick={() => void handleCopy()}
        >
          Copy Context Pack
        </button>
      </div>

      {pack && (
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
          value={assistantResponse}
          onChange={(e) => setAssistantResponse(e.target.value)}
          rows={6}
          disabled={!thread || disabled || busy}
          placeholder="Paste the response from ChatGPT, Claude, Gemini, OpenRouter, Ollama, or another AI."
        />
      </label>

      <button
        type="button"
        disabled={
          !thread ||
          disabled ||
          busy ||
          !pack?.text ||
          !draft.trim() ||
          !assistantResponse.trim()
        }
        onClick={() => void handleSave()}
      >
        {busy ? "Saving…" : "Save Exchange"}
      </button>

      {status && <p className="muted small">{status}</p>}
      {error && <p className="stream-error">{error}</p>}
    </section>
  );
}
