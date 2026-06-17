import type { ReactNode } from "react";
import { BackupsPanel } from "./BackupsPanel";
import { SettingsPanel } from "./SettingsPanel";
import { ProjectMemoryDashboard } from "./ProjectMemoryDashboard";
import { ProjectContinueSummary } from "./ProjectContinueSummary";
import type { ResumeCard } from "../project-memory";
import type { ProviderSetupPanelProps } from "./ProviderSetupPanel";
import {
  WORKSPACE_OPS_TABS,
  normalizeWorkspaceOpsTab,
  type WorkspaceOpsTabId,
} from "@shared/workspace-ops";
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
  LocalAiStatus,
  EmbeddedAiConsumerStatus,
  ProviderConfig,
  Workspace,
  AssistantProfile,
  AssistantProfileUpdate,
} from "@shared/types";

export type OpsTabId = WorkspaceOpsTabId | "overview" | "activity" | "restore-points" | "local-ai";
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
  onBackToChat?: () => void;
  onConnectAi?: () => void;
  appState: AppState | null;
  autosaveStatus: AutosaveStatus | null;
  workspaceHealth: WorkspaceHealthReport | null;
  healthLoading: boolean;
  timelineGroups: TimelineGroup[];
  snapshots: SnapshotRecord[];
  workspace: Workspace | null;
  workspaceId: string | null;
  threadId: string | null;
  recoveryMode: boolean;
  exporting: boolean;
  providerPanel: ProviderSetupPanelProps | null;
  providerConfig: ProviderConfig | null;
  localAiStatus: LocalAiStatus | null;
  embeddedAiConsumerStatus: EmbeddedAiConsumerStatus | null;
  onImport: () => void;
  onImportEncrypted: () => void;
  onExport: () => void;
  onEncryptedExport: () => void;
  onOpenDiagnostics: () => void;
  onOpenRecoveryDetails?: () => void;
  onCreateSnapshot: (label: string) => void;
  onRestorePreview: (snapshotId: string, workspaceId: string) => Promise<RestorePreview>;
  onRestore: (snapshotId: string, workspaceId: string) => Promise<RestoreExecutionResult>;
  onRestored: () => void;
  continuitySummary: string | null;
  onSaveContinuitySummary: (summary: string) => Promise<void>;
  onContinuityImported: (result: ContinuityImportApplyResult) => Promise<void>;
  focusTarget: OpsFocusTarget | null;
  focusTick: number;
  memoryDraft?: MemoryCompressionDraft | null;
  messagesSinceLastUpdate?: number;
  resumeCardData?: ResumeCard;
  onContinueProject?: () => void;
  onCreateMemoryUpdate?: () => void;
  onReviewMemory?: () => void;
  onSaveWorkspaceProfile: (patch: {
    name?: string;
    description?: string | null;
  }) => Promise<void>;
  assistantProfile: AssistantProfile | null;
  onSaveAssistantProfile: (patch: AssistantProfileUpdate) => Promise<void>;
  onSaveProvider: ProviderSetupPanelProps["onSave"];
  onTestProvider: ProviderSetupPanelProps["onTest"];
  onOpenProviderUrl: (url: string) => void;
};

export function OpsSidebar({
  activeTab,
  onTabChange,
  onClose,
  onBackToChat,
  onConnectAi,
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
  providerConfig,
  localAiStatus,
  embeddedAiConsumerStatus,
  onImport,
  onImportEncrypted,
  onExport,
  onEncryptedExport,
  onOpenDiagnostics,
  onOpenRecoveryDetails,
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
  resumeCardData,
  onContinueProject,
  onCreateMemoryUpdate,
  onReviewMemory,
  workspace,
  onSaveWorkspaceProfile,
  assistantProfile,
  onSaveAssistantProfile,
  onSaveProvider,
  onTestProvider,
  onOpenProviderUrl,
}: Props) {
  const tab = normalizeWorkspaceOpsTab(activeTab);
  let panel: ReactNode = null;

  if (tab === "backups") {
    panel = (
      <>
        {resumeCardData?.show && (
          <ProjectContinueSummary
            data={resumeCardData}
            onContinueChatting={onContinueProject ?? onClose}
            onReviewMemory={onReviewMemory ?? (() => {})}
            onCreateMemoryUpdate={onCreateMemoryUpdate ?? (() => {})}
          />
        )}
        <ProjectMemoryDashboard
          draft={memoryDraft}
          messagesSinceLastUpdate={messagesSinceLastUpdate}
          disabled={recoveryMode}
          onCreateMemoryUpdate={onCreateMemoryUpdate ?? (() => {})}
          onReviewMemory={onReviewMemory ?? (() => {})}
          onExportBackup={onExport}
          onOpenAdvanced={() => onTabChange("settings")}
        />
        <BackupsPanel
          workspaceId={workspaceId}
          threadId={threadId}
          snapshots={snapshots}
          recoveryMode={recoveryMode}
          exporting={exporting}
          hasBackups={snapshots.length > 0 || Boolean(autosaveStatus?.lastAutosaveAt)}
          onExport={onExport}
          onEncryptedExport={onEncryptedExport}
          onImport={onImport}
          onImportEncrypted={onImportEncrypted}
          onCreateSnapshot={onCreateSnapshot}
          onRestorePreview={onRestorePreview}
          onRestore={onRestore}
          onRestored={onRestored}
          onContinuityImported={onContinuityImported}
          focusTarget={focusTarget === "import-memory" ? "import-memory" : null}
          focusTick={focusTick}
        />
      </>
    );
  } else {
    panel = (
      <SettingsPanel
        workspace={
          workspace && workspaceHealth
            ? { ...workspace, continuityHealthStatus: workspaceHealth.status }
            : workspace
        }
        workspaceId={workspaceId}
        assistantProfile={assistantProfile}
        appState={appState}
        autosaveStatus={autosaveStatus}
        workspaceHealth={workspaceHealth}
        healthLoading={healthLoading}
        timelineGroups={timelineGroups}
        providerConfig={providerConfig}
        localAiStatus={localAiStatus}
        embeddedAiConsumerStatus={embeddedAiConsumerStatus}
        providerPanel={providerPanel}
        focusLocalAiSignal={focusTarget === "local-ai" ? focusTick : 0}
        onBackToChat={onBackToChat ?? onClose}
        onConnectAi={onConnectAi ?? onClose}
        onSaveProvider={onSaveProvider}
        onTestProvider={onTestProvider}
        onOpenProviderUrl={onOpenProviderUrl}
        onSaveWorkspaceProfile={onSaveWorkspaceProfile}
        onSaveAssistantProfile={onSaveAssistantProfile}
        onOpenDiagnostics={onOpenDiagnostics}
        onOpenRecoveryDetails={onOpenRecoveryDetails}
      />
    );
  }

  return (
    <aside className="ops-sidebar" aria-label="Tools" data-testid="ops-sidebar">
      <div className="ops-sidebar-header">
        <div>
          <h2>Tools</h2>
          <p className="muted small workspace-ops-nav-hint">
            Chat stays front and center. Backups and settings live here.
          </p>
          <nav className="workspace-ops-structure muted small" aria-label="Workspace sections">
            <span>Conversations</span>
            <span aria-hidden> · </span>
            <span className={tab === "backups" ? "active" : ""}>Backups</span>
            <span aria-hidden> · </span>
            <span className={tab === "settings" ? "active" : ""}>Settings</span>
          </nav>
        </div>
        <button type="button" className="secondary small-btn" onClick={onClose}>
          Close
        </button>
      </div>
      <nav className="ops-tabs" aria-label="Workspace panels">
        {WORKSPACE_OPS_TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={tab === item.id ? "ops-tab active" : "ops-tab"}
            aria-current={tab === item.id ? "page" : undefined}
            onClick={() => onTabChange(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>
      <div className="ops-tab-panel">{panel}</div>
    </aside>
  );
}
