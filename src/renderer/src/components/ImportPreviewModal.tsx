import type { ImportPreview } from "@shared/types";

type Props = {
  preview: ImportPreview;
  importing: boolean;
  onConfirm: () => void;
  onClose: () => void;
};

export function ImportPreviewModal({
  preview,
  importing,
  onConfirm,
  onClose,
}: Props) {
  const exportedDate = (() => {
    const d = new Date(preview.exportedAt);
    return Number.isNaN(d.getTime())
      ? preview.exportedAt
      : d.toLocaleString();
  })();

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal import-preview-modal" data-testid="import-preview-modal">
        <h2>Import workspace</h2>
        <p className="muted small">
          Review the package below. Nothing is imported until you confirm.
        </p>

        <dl className="import-preview-stats">
          <dt>Workspace</dt>
          <dd>{preview.workspaceName}</dd>
          <dt>Threads</dt>
          <dd>{preview.threadCount}</dd>
          <dt>Messages</dt>
          <dd>{preview.messageCount}</dd>
          <dt>Snapshots</dt>
          <dd>{preview.snapshotCount}</dd>
          <dt>Export version</dt>
          <dd>{preview.exportVersion}</dd>
          <dt>Exported</dt>
          <dd>{exportedDate}</dd>
        </dl>

        {!preview.valid && (
          <p className="import-warning" role="alert">
            This package has validation issues and cannot be imported safely.
          </p>
        )}
        {preview.warnings.length > 0 && (
          <p className="import-warning">
            {preview.warnings.length} warning
            {preview.warnings.length === 1 ? "" : "s"} — review before importing.
          </p>
        )}

        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose} disabled={importing}>
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!preview.valid || importing}
          >
            {importing ? "Importing…" : "Import workspace"}
          </button>
        </div>
      </div>
    </div>
  );
}
