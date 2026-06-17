type Props = {
  message: string;
  workspaceId?: string | null;
  onExportBackup?: () => void;
  onOpenDiagnostics?: () => void;
};

export function RecoveryBanner({
  message,
  workspaceId,
  onExportBackup,
  onOpenDiagnostics,
}: Props) {
  return (
    <div className="recovery-banner" role="alert" data-testid="recovery-banner">
      <strong>Recovery mode</strong>
      <p>{message}</p>
      <p className="muted small">
        Your local continuity data has been preserved. Export a backup or open diagnostics
        while the database is verified.
      </p>
      <div className="recovery-banner-actions">
        {workspaceId && onExportBackup && (
          <button type="button" className="small-btn" onClick={onExportBackup}>
            Export backup
          </button>
        )}
        {onOpenDiagnostics && (
          <button type="button" className="secondary small-btn" onClick={onOpenDiagnostics}>
            Open diagnostics
          </button>
        )}
      </div>
    </div>
  );
}
