import { useMemo, useState } from "react";
import type {
  ContinuityImportApplyResult,
  ContinuityImportMode,
  ContinuityImportPreview,
} from "@shared/types";
import { CONTINUITY_IMPORT_FILE_PROMPT } from "@shared/continuity-import-prompt";

type Props = {
  workspaceId: string | null;
  disabled: boolean;
  onImported?: (result: ContinuityImportApplyResult) => Promise<void> | void;
};

function formatImportDate(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

export function ContinuityImportPanel({ workspaceId, disabled, onImported }: Props) {
  const [text, setText] = useState("");
  const [mode, setMode] = useState<ContinuityImportMode>("update-current");
  const [preview, setPreview] = useState<ContinuityImportPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generatedLabel = useMemo(
    () => (preview ? formatImportDate(preview.generatedAt) : "UNKNOWN"),
    [preview],
  );

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(CONTINUITY_IMPORT_FILE_PROMPT);
      setStatus("Import prompt copied. Paste it into ChatGPT, Claude, Gemini, Cursor, or another AI.");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not copy the import prompt.");
    }
  };

  const handlePreview = async () => {
    if (!window.continuity?.previewContinuityImport) return;
    setBusy(true);
    setStatus(null);
    setError(null);
    try {
      const nextPreview = await window.continuity.previewContinuityImport(text);
      setPreview(nextPreview);
      if (!nextPreview.valid) {
        setError(nextPreview.errors[0] ?? "Import file is not valid yet.");
      } else {
        setStatus("Import preview ready. Nothing changes until you confirm.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not preview the import file.");
    } finally {
      setBusy(false);
    }
  };

  const handleApply = async () => {
    if (!window.continuity?.applyContinuityImport) return;
    setBusy(true);
    setStatus(null);
    setError(null);
    try {
      const result = await window.continuity.applyContinuityImport({
        text,
        mode,
        workspaceId: workspaceId ?? undefined,
      });
      if (!result.ok) {
        throw new Error(result.message);
      }
      await onImported?.(result);
      setStatus(result.message);
      setPreview(null);
      setText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not apply the import file.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="continuity-import-panel" aria-label="AI chat import">
      <div className="continuity-import-header">
        <div>
          <h3>Create import file from current AI chat</h3>
          <p className="muted small">
            Use this when your current AI chat is getting too long or sluggish. This
            creates a portable project memory file that ContinuityOS can import.
          </p>
        </div>
        <button type="button" className="secondary small-btn" onClick={() => void copyPrompt()}>
          Copy import prompt
        </button>
      </div>

      <ol className="muted small continuity-import-steps">
        <li>Go to your current AI chat.</li>
        <li>Paste this prompt.</li>
        <li>The AI will generate a ContinuityOS Import File.</li>
        <li>Copy the entire file.</li>
        <li>Return to ContinuityOS.</li>
        <li>Paste/import it.</li>
        <li>Review preview.</li>
        <li>Confirm import.</li>
      </ol>

      <label className="continuity-import-field">
        <span>Paste ContinuityOS Import File</span>
        <textarea
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setPreview(null);
            setStatus(null);
            setError(null);
          }}
          rows={14}
          disabled={disabled || busy}
          placeholder="# CONTINUITYOS IMPORT FILE&#10;version: 1&#10;source_ai: ChatGPT&#10;..."
        />
      </label>

      <div className="continuity-import-actions">
        <button
          type="button"
          className="secondary"
          disabled={disabled || busy || !text.trim()}
          onClick={() => void handlePreview()}
        >
          {busy ? "Working…" : "Preview Import"}
        </button>
      </div>

      {preview && (
        <div className="continuity-import-preview">
          <h4>Import preview</h4>
          <dl className="continuity-import-stats">
            <dt>Project name</dt>
            <dd>{preview.projectName}</dd>
            <dt>Project type</dt>
            <dd>{preview.projectType}</dd>
            <dt>Current objective</dt>
            <dd>{preview.currentObjective}</dd>
            <dt>Continuity summary</dt>
            <dd>{preview.continuitySummary}</dd>
            <dt>Stable facts</dt>
            <dd>{preview.stableFacts.length}</dd>
            <dt>Decisions made</dt>
            <dd>{preview.decisionsMade.length}</dd>
            <dt>Open issues</dt>
            <dd>{preview.openIssues.length}</dd>
            <dt>Next steps</dt>
            <dd>{preview.nextSteps.length}</dd>
            <dt>Source AI</dt>
            <dd>{preview.sourceAi}</dd>
            <dt>Generated</dt>
            <dd>{generatedLabel}</dd>
          </dl>

          <fieldset className="continuity-import-modes">
            <legend>Apply mode</legend>
            <label>
              <input
                type="radio"
                name="continuity-import-mode"
                value="update-current"
                checked={mode === "update-current"}
                onChange={() => setMode("update-current")}
                disabled={disabled || !workspaceId}
              />
              <span>Update current workspace</span>
            </label>
            <label>
              <input
                type="radio"
                name="continuity-import-mode"
                value="create-workspace"
                checked={mode === "create-workspace"}
                onChange={() => setMode("create-workspace")}
                disabled={disabled}
              />
              <span>Create new workspace</span>
            </label>
            <label>
              <input
                type="radio"
                name="continuity-import-mode"
                value="checkpoint-only"
                checked={mode === "checkpoint-only"}
                onChange={() => setMode("checkpoint-only")}
                disabled={disabled || !workspaceId}
              />
              <span>Add as checkpoint only</span>
            </label>
          </fieldset>

          <div className="continuity-import-actions">
            <button
              type="button"
              disabled={
                disabled ||
                busy ||
                !preview.valid ||
                ((mode === "update-current" || mode === "checkpoint-only") && !workspaceId)
              }
              onClick={() => void handleApply()}
            >
              {busy ? "Applying…" : "Confirm Import"}
            </button>
          </div>
        </div>
      )}

      {status && <p className="muted small">{status}</p>}
      {error && <p className="stream-error">{error}</p>}
    </section>
  );
}
