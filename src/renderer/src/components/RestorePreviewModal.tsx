import type { RestorePreview } from "@shared/types";

type Props = {
  preview: RestorePreview;
  restoring: boolean;
  onConfirm: () => void;
  onClose: () => void;
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

function replayLabel(status: RestorePreview["replayHashStatus"]): string {
  switch (status) {
    case "verified":
      return "Replay hash matches snapshot";
    case "mismatch":
      return "Replay hash differs from snapshot";
    case "unknown":
      return "Replay hash not recorded on snapshot";
    default:
      return "Replay hash unavailable";
  }
}

export function RestorePreviewModal({
  preview,
  restoring,
  onConfirm,
  onClose,
}: Props) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal restore-preview-modal">
        <h2>Restore snapshot</h2>
        <p className="muted small">{preview.summaryMessage}</p>

        <dl className="import-preview-stats">
          <dt>Snapshot</dt>
          <dd>{preview.label}</dd>
          <dt>Created</dt>
          <dd>{formatTime(preview.createdAt)}</dd>
          <dt>App version</dt>
          <dd>{preview.appVersion ?? "—"}</dd>
          <dt>Schema version</dt>
          <dd>{preview.schemaVersion ?? "—"}</dd>
          <dt>Threads affected</dt>
          <dd>{preview.affectedThreadCount}</dd>
          <dt>Messages in checkpoint</dt>
          <dd>{preview.affectedMessageCount}</dd>
          <dt>Estimated changes</dt>
          <dd>
            ~{preview.messagesAddedEstimate} restored, ~{preview.messagesRemovedEstimate}{" "}
            replaced
          </dd>
          <dt>Replay integrity</dt>
          <dd>{replayLabel(preview.replayHashStatus)}</dd>
        </dl>

        {preview.warnings.length > 0 && (
          <p className="import-warning">
            {preview.warnings.length} note
            {preview.warnings.length === 1 ? "" : "s"} — review before restoring.
          </p>
        )}

        {!preview.canRestore && (
          <p className="import-warning" role="alert">
            Restore is blocked until validation passes.
          </p>
        )}

        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose} disabled={restoring}>
            Cancel
          </button>
          <button
            type="button"
            disabled={!preview.canRestore || restoring}
            onClick={onConfirm}
          >
            {restoring ? "Restoring…" : "Confirm restore"}
          </button>
        </div>
      </div>
    </div>
  );
}
