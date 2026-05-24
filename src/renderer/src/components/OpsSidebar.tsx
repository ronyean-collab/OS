import type { ReactNode } from "react";
import { ProviderSetupPanel, type ProviderSetupPanelProps } from "./ProviderSetupPanel";
import { ReliabilityIndicators } from "./ReliabilityIndicators";
import { WorkspaceHealthPanel } from "./WorkspaceHealthPanel";
import { ContinuitySummaryPanel } from "./ContinuitySummaryPanel";
import { TimelinePanel } from "./TimelinePanel";
import { SnapshotPanel } from "./SnapshotPanel";
import type {
  AppState,
  AutosaveStatus,
  RestoreExecutionResult,
  RestorePreview,
  SnapshotRecord,
  TimelineGroup,
  WorkspaceHealthReport,
} from "@shared/types";

export type OpsTabId = "overview" | "timeline" | "snapshots" | "provider";

type Props = {
  activeTab: OpsTabId;
  onTabChange: (tab: OpsTabId) => void;
  appState: AppState | null;
  autosaveStatus: AutosaveStatus | null;
  workspaceHealth: WorkspaceHealthReport | null;
  healthLoading: boolean;
  timelineGroups: TimelineGroup[];
  snapshots: SnapshotRecord[];
  workspaceId: string | null;
  recoveryMode: boolean;
  providerPanel: ProviderSetupPanelProps | null;
  onCreateSnapshot: (label: string) => void;
  onRestorePreview: (snapshotId: string, workspaceId: string) => Promise<RestorePreview>;
  onRestore: (snapshotId: string, workspaceId: string) => Promise<RestoreExecutionResult>;
  onRestored: () => void;
  continuitySummary: string | null;
  onSaveContinuitySummary: (summary: string) => Promise<void>;
};

const TABS: { id: OpsTabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "timeline", label: "Timeline" },
  { id: "snapshots", label: "Snapshots" },
  { id: "provider", label: "Provider" },
];

export function OpsSidebar({
  activeTab,
  onTabChange,
  appState,
  autosaveStatus,
  workspaceHealth,
  healthLoading,
  timelineGroups,
  snapshots,
  workspaceId,
  recoveryMode,
  providerPanel,
  onCreateSnapshot,
  onRestorePreview,
  onRestore,
  onRestored,
  continuitySummary,
  onSaveContinuitySummary,
}: Props) {
  let panel: ReactNode = null;

  if (activeTab === "overview") {
    panel = (
      <>
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
      />
    );
  }

  return (
    <aside className="ops-sidebar">
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
