import type { Workspace } from "@shared/types";

type Props = {
  workspace: Workspace | null;
  subtitle: string;
  ollamaStatusLabel?: string | null;
  projectToolsOpen: boolean;
  onToggleProjectTools: () => void;
};

export function WorkspaceHeader({
  workspace,
  subtitle,
  ollamaStatusLabel,
  projectToolsOpen,
  onToggleProjectTools,
}: Props) {
  return (
    <header className="workspace-header">
      <div className="workspace-header-copy">
        <p className="eyebrow">ContinuityOS</p>
        <h1>{workspace?.name ?? "Your workspace"}</h1>
        <p className="muted small workspace-header-subtitle">
          {subtitle
            .replace("Your assistant is ready.", "Polaris is ready.")
            .replace("Your assistant is ready", "Polaris is ready")
            .replace("AI is ready", "Polaris is ready")}
        </p>
        {ollamaStatusLabel && (
          <p className="muted small workspace-header-status">
            <span className="mono">
              {ollamaStatusLabel
                .replace("AI is ready", "Polaris is ready")
                .replace("AI needs attention", "Polaris needs attention")
                .replace("AI is preparing", "Polaris is preparing")}
            </span>
          </p>
        )}
      </div>
      <div className="header-actions">
        <button
          type="button"
          className="secondary"
          data-testid="workspace-toggle"
          onClick={onToggleProjectTools}
        >
          {projectToolsOpen ? "Close panel" : "Tools"}
        </button>
      </div>
    </header>
  );
}


