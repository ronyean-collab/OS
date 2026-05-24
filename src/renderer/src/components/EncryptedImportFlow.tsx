import { useState } from "react";
import type { EncryptedImportPreviewResult, ImportPreview } from "@shared/types";

type Props = {
  json: string;
  fileName: string;
  onClose: () => void;
  onPreview: (json: string, password: string) => Promise<EncryptedImportPreviewResult>;
  onConfirmImport: (json: string, password: string) => Promise<void>;
};

export function EncryptedImportFlow({
  json,
  fileName,
  onClose,
  onPreview,
  onConfirmImport,
}: Props) {
  const [password, setPassword] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [importing, setImporting] = useState(false);

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal import-preview-modal">
        <h2>Import encrypted backup</h2>
        <p className="muted small">
          Password decrypts locally only — it is never stored or sent anywhere.
        </p>
        <p className="muted small">{fileName}</p>

        <label className="encrypted-import-password">
          <span>Backup password</span>
          <input
            type="password"
            value={password}
            autoComplete="off"
            onChange={(e) => {
              setPassword(e.target.value);
              setError(null);
              setPreview(null);
            }}
          />
        </label>

        {error && (
          <p className="import-warning" role="alert">
            {error}
          </p>
        )}

        {preview && (
          <>
            <dl className="import-preview-stats">
              <dt>Workspace</dt>
              <dd>{preview.workspaceName}</dd>
              <dt>Threads</dt>
              <dd>{preview.threadCount}</dd>
              <dt>Messages</dt>
              <dd>{preview.messageCount}</dd>
              <dt>Snapshots</dt>
              <dd>{preview.snapshotCount}</dd>
              <dt>Source</dt>
              <dd>Encrypted local backup</dd>
            </dl>
            {!preview.valid && (
              <p className="import-warning">This backup cannot be imported safely.</p>
            )}
            {preview.warnings.length > 0 && (
              <p className="import-warning">
                {preview.warnings.length} warning
                {preview.warnings.length === 1 ? "" : "s"} — review before importing.
              </p>
            )}
          </>
        )}

        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose} disabled={importing}>
            Cancel
          </button>
          {!preview ? (
            <button
              type="button"
              disabled={checking || password.length < 8}
              onClick={() => {
                setChecking(true);
                void onPreview(json, password)
                  .then((result) => {
                    if (!result.ok) {
                      setError(
                        result.error ??
                          "Could not unlock this backup. Nothing was imported.",
                      );
                      return;
                    }
                    setPreview(result.preview);
                  })
                  .catch((err) => {
                    const message =
                      err instanceof Error
                        ? err.message
                        : "Could not unlock this backup. Nothing was imported.";
                    setError(message);
                    if (import.meta.env.DEV) {
                      console.error("[continuity] encrypted import preview failed", err);
                    }
                  })
                  .finally(() => setChecking(false));
              }}
            >
              {checking ? "Unlocking…" : "Unlock & preview"}
            </button>
          ) : (
            <button
              type="button"
              disabled={!preview.valid || importing}
              onClick={() => {
                setImporting(true);
                void onConfirmImport(json, password)
                  .catch((err) => {
                    setError(
                      err instanceof Error ? err.message : "Encrypted import failed.",
                    );
                    if (import.meta.env.DEV) {
                      console.error("[continuity] encrypted import confirm failed", err);
                    }
                  })
                  .finally(() => setImporting(false));
              }}
            >
              {importing ? "Importing…" : "Confirm import"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
