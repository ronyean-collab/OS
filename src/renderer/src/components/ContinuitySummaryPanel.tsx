import { useEffect, useState } from "react";

type Props = {
  workspaceId: string | null;
  summary: string | null;
  disabled?: boolean;
  onSave: (summary: string) => Promise<void>;
};

export function ContinuitySummaryPanel({
  workspaceId,
  summary,
  disabled,
  onSave,
}: Props) {
  const [draft, setDraft] = useState(summary ?? "");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!editing) {
      setDraft(summary ?? "");
    }
  }, [summary, editing]);

  if (!workspaceId) {
    return (
      <section className="continuity-summary" aria-label="Continuity summary">
        <h3>Continuity summary</h3>
        <p className="muted small">Open a workspace to edit project context.</p>
      </section>
    );
  }

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave(draft);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save summary.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="continuity-summary" aria-label="Continuity summary">
      <h3>Continuity summary</h3>
      <p className="muted small continuity-summary-hint">
        Use this to preserve important project context across long chats. It does not
        delete your message history.
      </p>
      {editing ? (
        <>
          <textarea
            className="continuity-summary-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={6}
            disabled={disabled || saving}
            placeholder="Goals, decisions, constraints, open questions…"
            aria-label="Continuity summary text"
          />
          <div className="continuity-summary-actions">
            <button
              type="button"
              className="btn primary"
              disabled={disabled || saving}
              onClick={() => void handleSave()}
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              className="btn"
              disabled={saving}
              onClick={() => {
                setDraft(summary ?? "");
                setEditing(false);
                setError(null);
              }}
            >
              Cancel
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="continuity-summary-display">
            {summary?.trim() ? (
              <pre className="continuity-summary-text">{summary}</pre>
            ) : (
              <p className="muted small">No summary yet. Add notes your future chats should remember.</p>
            )}
          </div>
          <button
            type="button"
            className="btn"
            disabled={disabled}
            onClick={() => setEditing(true)}
          >
            Edit
          </button>
        </>
      )}
      {error && <p className="error small">{error}</p>}
    </section>
  );
}
