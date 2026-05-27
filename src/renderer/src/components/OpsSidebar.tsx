import type { ReactNode } from "react";
import { ProviderSetupPanel, type ProviderSetupPanelProps } from "./ProviderSetupPanel";
import { ReliabilityIndicators } from "./ReliabilityIndicators";
import { WorkspaceHealthPanel } from "./WorkspaceHealthPanel";
import { ContinuitySummaryPanel } from "./ContinuitySummaryPanel";
import { TimelinePanel } from "./TimelinePanel";
import { SnapshotPanel } from "./SnapshotPanel";
import { ContinuityImportPanel } from "./ContinuityImportPanel";
import { ProjectMemoryDashboard } from "./ProjectMemoryDashboard";
import type {
  AppState,
  AutosaveStatus,
  ContinuityImportApplyResult,
  MemoryCompressionDraft,
  RestoreExecutionResult,
  RestorePreview,
  SnapshotRecord,
  TimelineGroup,
  WorkspaceHealthReport,
} from "@shared/types";

export type OpsTabId = "overview" | "activity" | "restore-points" | "local-ai";
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
  // Consumer memory props
  memoryDraft?: MemoryCompressionDraft | null;
  messagesSinceLastUpdate?: number;
  onCreateMemoryUpdate?: () => void;
  onReviewMemory?: () => void;
};

const TABS: { id: OpsTabId; label: string }[] = [
  { id: "overview", label: "Memory & Backup" },
  { id: "activity", label: "Activity History" },
  { id: "restore-points", label: "Restore Points" },
  { id: "local-ai", label: "Local AI Setup" },
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
  memoryDraft = null,
  messagesSinceLastUpdate = 0,
  onCreateMemoryUpdate,
  onReviewMemory,
}: Props) {
  let panel: ReactNode = null;

  if (activeTab === "overview") {
    panel = (
      <>
        <ProjectMemoryDashboard
          draft={memoryDraft}
          messagesSinceLastUpdate={messagesSinceLastUpdate}
          disabled={recoveryMode}
          onCreateMemoryUpdate={onCreateMemoryUpdate ?? (() => {})}
          onReviewMemory={onReviewMemory ?? (() => {})}
          onExportBackup={onExport}
          onOpenAdvanced={() => {}}
        />
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
  } else if (activeTab === "activity") {
    panel = <TimelinePanel groups={timelineGroups} />;
  } else if (activeTab === "restore-points") {
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
  } else if (activeTab === "local-ai" && providerPanel) {
    panel = (
      <ProviderSetupPanel
        key={providerPanel.initialProviderId ?? providerPanel.initial?.provider ?? "ollama"}
        {...providerPanel}
        focusLocalAiSignal={focusTarget === "local-ai" ? focusTick : 0}
      />
    );
  }

  return (
    <aside className="ops-sidebar">
      <div className="ops-sidebar-header">
        <div>
          <h2>Project Tools</h2>
          <p className="muted small">
            Memory updates, backups, restore points, and Local AI setup. Advanced tools live here
            so your main chat stays clean.
          </p>
        </div>
        <button type="button" className="secondary small-btn" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="ops-quick-actions">
        <button type="button" className="secondary small-btn" disabled={!workspaceId || exporting} onClick={onExport}>
          {exporting ? "Exporting…" : "Export Backup"}
        </button>
        <button
          type="button"
          className="secondary small-btn"
          disabled={!workspaceId || recoveryMode || exporting}
          onClick={onEncryptedExport}
        >
          Encrypted Backup
        </button>
        <button type="button" className="secondary small-btn" disabled={!workspaceId} onClick={onImport}>
          Restore from Backup
        </button>
        <button
          type="button"
          className="secondary small-btn"
          disabled={!workspaceId || recoveryMode}
          onClick={onImportEncrypted}
        >
          Restore from Encrypted Backup
        </button>
        <button type="button" className="secondary small-btn" onClick={onOpenDiagnostics}>
          Troubleshooting
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
