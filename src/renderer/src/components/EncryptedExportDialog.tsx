import { useState } from "react";

type Props = {
  workspaceName: string;
  exporting: boolean;
  onClose: () => void;
  onExport: (password: string) => Promise<void>;
};

export function EncryptedExportDialog({
  workspaceName,
  exporting,
  onClose,
  onExport,
}: Props) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  const passwordsMatch = password === confirm;
  const canSubmit =
    password.length >= 8 && confirm.length >= 8 && passwordsMatch && !exporting;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal import-preview-modal">
        <h2>Encrypted backup</h2>
        <p className="muted small">
          Export <strong>{workspaceName}</strong> as a password-protected local backup.
          The password is never stored or sent anywhere.
        </p>

        <label className="encrypted-import-password">
          <span>Backup password (min 8 characters)</span>
          <input
            type="password"
            value={password}
            autoComplete="new-password"
            onChange={(e) => {
              setPassword(e.target.value);
              setError(null);
            }}
          />
        </label>

        <label className="encrypted-import-password">
          <span>Confirm password</span>
          <input
            type="password"
            value={confirm}
            autoComplete="new-password"
            onChange={(e) => {
              setConfirm(e.target.value);
              setError(null);
            }}
          />
        </label>

        {confirm.length >= 8 && !passwordsMatch && (
          <p className="import-warning" role="alert">
            Passwords do not match.
          </p>
        )}

        {error && (
          <p className="import-warning" role="alert">
            {error}
          </p>
        )}

        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose} disabled={exporting}>
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => {
              void onExport(password).catch((err) => {
                const message =
                  err instanceof Error ? err.message : "Encrypted export failed.";
                setError(message);
                if (import.meta.env.DEV) {
                  console.error("[continuity] encrypted export failed", err);
                }
              });
            }}
          >
            {exporting ? "Exporting…" : "Save encrypted backup"}
          </button>
        </div>
      </div>
    </div>
  );
}
