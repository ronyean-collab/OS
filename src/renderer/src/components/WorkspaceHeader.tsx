import type { Workspace } from "@shared/types";

type Props = {
  workspace: Workspace | null;
  exporting?: boolean;
  recoveryMode?: boolean;
  providerBadge?: string | null;
  providerRuntimeReady?: boolean;
  onExport?: () => void;
  onEncryptedExport?: () => void;
  onImport?: () => void;
  onImportEncrypted?: () => void;
  onOpenDiagnostics?: () => void;
  onOpenSettings: () => void;
};

export function WorkspaceHeader({
  workspace,
  exporting,
  recoveryMode,
  onExport,
  onEncryptedExport,
  onImport,
  onImportEncrypted,
  onOpenDiagnostics,
  onOpenSettings,
  providerBadge,
  providerRuntimeReady,
}: Props) {
  const importEncryptedDisabled = recoveryMode || !onImportEncrypted;
  const importEncryptedTitle = recoveryMode
    ? "Import is unavailable while the database is in recovery mode."
    : undefined;

  const encryptedExportDisabled = recoveryMode || !workspace || exporting;
  const encryptedExportTitle = recoveryMode
    ? "Export is unavailable while the database is in recovery mode."
    : !workspace
      ? "Open or create a workspace before exporting an encrypted backup."
      : exporting
        ? "Export already in progress."
        : "Encrypted backup (Ctrl+Shift+K)";

  return (
    <header className="workspace-header">
      <div>
        <p className="eyebrow">ContinuityOS</p>
        <h1>{workspace?.name ?? "No workspace"}</h1>
        {providerBadge && (
          <button
            type="button"
            className={`header-provider-badge ${providerRuntimeReady ? "ready" : "pending"}`}
            onClick={onOpenSettings}
            title="Change provider"
          >
            {providerBadge}
            {!providerRuntimeReady && " · setup only"}
          </button>
        )}
      </div>
      <div className="header-actions">
        {onImport && (
          <button
            type="button"
            className="secondary"
            disabled={!workspace}
            onClick={onImport}
          >
            Import…
          </button>
        )}
        {onImportEncrypted && (
          <button
            type="button"
            className="secondary"
            disabled={importEncryptedDisabled}
            title={importEncryptedTitle}
            onClick={onImportEncrypted}
          >
            Import encrypted…
          </button>
        )}
        {onExport && (
          <button
            type="button"
            className="secondary"
            disabled={!workspace || exporting}
            onClick={onExport}
            title="Export workspace (Ctrl+Shift+E)"
          >
            {exporting ? "Exporting…" : "Export"}
          </button>
        )}
        {onEncryptedExport && (
          <button
            type="button"
            className="secondary"
            disabled={encryptedExportDisabled}
            onClick={onEncryptedExport}
            title={encryptedExportTitle}
          >
            Encrypted…
          </button>
        )}
        {onOpenDiagnostics && (
          <button type="button" className="secondary" onClick={onOpenDiagnostics}>
            Diagnostics
          </button>
        )}
        <button type="button" className="secondary" onClick={onOpenSettings}>
          {providerBadge ? "Change provider" : "Provider"}
        </button>
      </div>
    </header>
  );
}
