import type { Workspace } from "@shared/types";

type Props = {
  workspace: Workspace | null;
  ollamaStatusLabel?: string | null;
  projectToolsOpen: boolean;
  onToggleProjectTools: () => void;
};

export function WorkspaceHeader({
  workspace,
  ollamaStatusLabel,
  projectToolsOpen,
  onToggleProjectTools,
}: Props) {
  return (
    <header className="workspace-header">
      <div className="workspace-header-copy">
        <p className="eyebrow">ContinuityOS</p>
        <h1>{workspace?.name ?? "No workspace"}</h1>
        <p className="muted small workspace-header-subtitle">
          Chat with Ollama. ContinuityOS saves and compresses memory in the background.
        </p>
        {ollamaStatusLabel && (
          <p className="muted small workspace-header-status">
            <span className="mono">{ollamaStatusLabel}</span>
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
