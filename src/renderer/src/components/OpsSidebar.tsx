import type { ReactNode } from "react";
import { ProviderSetupPanel, type ProviderSetupPanelProps } from "./ProviderSetupPanel";
import { ReliabilityIndicators } from "./ReliabilityIndicators";
import { WorkspaceHealthPanel } from "./WorkspaceHealthPanel";
import { ContinuitySummaryPanel } from "./ContinuitySummaryPanel";
import { TimelinePanel } from "./TimelinePanel";
import { SnapshotPanel } from "./SnapshotPanel";
import { ContinuityImportPanel } from "./ContinuityImportPanel";
import type {
  AppState,
  AutosaveStatus,
  ContinuityImportApplyResult,
  RestoreExecutionResult,
  RestorePreview,
  SnapshotRecord,
  TimelineGroup,
  WorkspaceHealthReport,
} from "@shared/types";

export type OpsTabId = "overview" | "timeline" | "snapshots" | "provider";
export type OpsFocusTarget =
  | "import-memory"
  | "review-memory"
  | "backup-export"
  | "memory-update"
  | "local-ai";

type Props = {
  activeTab: OpsTabId;
  onTabChange: (tab: OpsTabId) => void;
  onClose: () => void;
  appState: AppState | null;
  autosaveStatus: AutosaveStatus | null;
  workspaceHealth: WorkspaceHealthReport | null;
  healthLoading: boolean;
  timelineGroups: TimelineGroup[];
  snapshots: SnapshotRecord[];
  workspaceId: string | null;
  threadId: string | null;
  recoveryMode: boolean;
  exporting: boolean;
  providerPanel: ProviderSetupPanelProps | null;
  onImport: () => void;
  onImportEncrypted: () => void;
  onExport: () => void;
  onEncryptedExport: () => void;
  onOpenDiagnostics: () => void;
  onCreateSnapshot: (label: string) => void;
  onRestorePreview: (snapshotId: string, workspaceId: string) => Promise<RestorePreview>;
  onRestore: (snapshotId: string, workspaceId: string) => Promise<RestoreExecutionResult>;
  onRestored: () => void;
  continuitySummary: string | null;
  onSaveContinuitySummary: (summary: string) => Promise<void>;
  onContinuityImported: (result: ContinuityImportApplyResult) => Promise<void>;
  focusTarget: OpsFocusTarget | null;
  focusTick: number;
};

const TABS: { id: OpsTabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "timeline", label: "Timeline" },
  { id: "snapshots", label: "Snapshots" },
  { id: "provider", label: "Ollama" },
];

export function OpsSidebar({
  activeTab,
  onTabChange,
  onClose,
  appState,
  autosaveStatus,
  workspaceHealth,
  healthLoading,
  timelineGroups,
  snapshots,
  workspaceId,
  threadId,
  recoveryMode,
  exporting,
  providerPanel,
  onImport,
  onImportEncrypted,
  onExport,
  onEncryptedExport,
  onOpenDiagnostics,
  onCreateSnapshot,
  onRestorePreview,
  onRestore,
  onRestored,
  continuitySummary,
  onSaveContinuitySummary,
  onContinuityImported,
  focusTarget,
  focusTick,
}: Props) {
  let panel: ReactNode = null;

  if (activeTab === "overview") {
    panel = (
      <>
        <ContinuityImportPanel
          workspaceId={workspaceId}
          threadId={threadId}
          disabled={recoveryMode}
          onImported={onContinuityImported}
          focusTarget={focusTarget}
          focusTick={focusTick}
        />
        <ContinuitySummaryPanel
          workspaceId={workspaceId}
          summary={continuitySummary}
          disabled={recoveryMode}
          onSave={onSaveContinuitySummary}
        />
        <ReliabilityIndicators appState={appState} autosave={autosaveStatus} />
        <WorkspaceHealthPanel
          health={workspaceHealth}
          autosave={autosaveStatus}
          loading={healthLoading}
        />
      </>
    );
  } else if (activeTab === "timeline") {
    panel = <TimelinePanel groups={timelineGroups} />;
  } else if (activeTab === "snapshots") {
    panel = (
      <SnapshotPanel
        snapshots={snapshots}
        workspaceId={workspaceId}
        disabled={recoveryMode}
        onCreate={onCreateSnapshot}
        onRestorePreview={onRestorePreview}
        onRestore={onRestore}
        onRestored={onRestored}
      />
    );
  } else if (activeTab === "provider" && providerPanel) {
    panel = (
      <ProviderSetupPanel
        key={providerPanel.initialProviderId ?? providerPanel.initial?.provider ?? "openai"}
        {...providerPanel}
        focusLocalAiSignal={focusTarget === "local-ai" ? focusTick : 0}
      />
    );
  }

  return (
    <aside className="ops-sidebar">
      <div className="ops-sidebar-header">
        <div>
          <h2>Project tools</h2>
          <p className="muted small">
            Ollama powers direct chat. Import/export, compressed memory, diagnostics, and recovery
            tools stay available here.
          </p>
          <p className="muted small">
            Advanced AI handoff exports stay available here, but they are no longer the normal chat
            path.
          </p>
        </div>
        <button type="button" className="secondary small-btn" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="ops-quick-actions">
        <button type="button" className="secondary small-btn" disabled={!workspaceId} onClick={onImport}>
          Import
        </button>
        <button
          type="button"
          className="secondary small-btn"
          disabled={!workspaceId || recoveryMode}
          onClick={onImportEncrypted}
        >
          Import encrypted
        </button>
        <button
          type="button"
          className="secondary small-btn"
          disabled={!workspaceId || exporting}
          onClick={onExport}
        >
          {exporting ? "Exporting…" : "Export"}
        </button>
        <button
          type="button"
          className="secondary small-btn"
          disabled={!workspaceId || recoveryMode || exporting}
          onClick={onEncryptedExport}
        >
          Encrypted backup
        </button>
        <button type="button" className="secondary small-btn" onClick={onOpenDiagnostics}>
          Diagnostics
        </button>
      </div>
      <nav className="ops-tabs" aria-label="Workspace panels">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={activeTab === tab.id ? "ops-tab active" : "ops-tab"}
            aria-current={activeTab === tab.id ? "page" : undefined}
            onClick={() => onTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>
      <div className="ops-tab-panel">{panel}</div>
    </aside>
  );
}
