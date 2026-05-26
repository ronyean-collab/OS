import type { Workspace } from "@shared/types";

type Props = {
  workspace: Workspace | null;
  providerBadge?: string | null;
  providerRuntimeReady?: boolean;
  projectToolsOpen: boolean;
  onToggleProjectTools: () => void;
};

export function WorkspaceHeader({
  workspace,
  providerBadge,
  providerRuntimeReady,
  projectToolsOpen,
  onToggleProjectTools,
}: Props) {
  return (
    <header className="workspace-header">
      <div className="workspace-header-copy">
        <p className="eyebrow">ContinuityOS</p>
        <h1>{workspace?.name ?? "No workspace"}</h1>
        <p className="muted small workspace-header-subtitle">
          Chat normally. ContinuityOS saves your work locally, keeps compressed memory visible, and
          helps any AI continue from your project state.
        </p>
        {providerBadge && providerRuntimeReady && (
          <p className="muted small workspace-header-status">
            Optional provider connected: <span className="mono">{providerBadge}</span>
          </p>
        )}
      </div>
      <div className="header-actions">
        <button type="button" className="secondary" onClick={onToggleProjectTools}>
          {projectToolsOpen ? "Hide project tools" : "Project tools"}
        </button>
      </div>
    </header>
  );
}
