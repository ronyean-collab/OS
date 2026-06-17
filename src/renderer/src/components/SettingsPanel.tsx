import { ReliabilityIndicators } from "./ReliabilityIndicators";
import { WorkspaceHealthPanel } from "./WorkspaceHealthPanel";
import { TimelinePanel } from "./TimelinePanel";
import { WorkspaceProfileSection } from "./WorkspaceProfileSection";
import { AssistantSettingsSection } from "./AssistantSettingsSection";
import { ProvidersCenterPanel } from "./ProvidersCenterPanel";
import { ProviderSetupPanel, type ProviderSetupPanelProps } from "./ProviderSetupPanel";
import { AiConnectionStatusSection } from "./AiConnectionStatusSection";
import { SETTINGS_ACTIVITY_EMPTY } from "@shared/consumer-experience-copy";
import type {
  AppState,
  AssistantProfile,
  AssistantProfileUpdate,
  AutosaveStatus,
  EmbeddedAiConsumerStatus,
  LocalAiStatus,
  ProviderConfig,
  ProviderTestResult,
  TimelineGroup,
  Workspace,
  WorkspaceHealthReport,
} from "@shared/types";

type Props = {
  workspace: Workspace | null;
  workspaceId: string | null;
  assistantProfile: AssistantProfile | null;
  appState: AppState | null;
  autosaveStatus: AutosaveStatus | null;
  workspaceHealth: WorkspaceHealthReport | null;
  healthLoading: boolean;
  timelineGroups: TimelineGroup[];
  providerConfig: ProviderConfig | null;
  localAiStatus: LocalAiStatus | null;
  embeddedAiConsumerStatus: EmbeddedAiConsumerStatus | null;
  providerPanel: ProviderSetupPanelProps | null;
  focusLocalAiSignal?: number;
  onBackToChat?: () => void;
  onConnectAi: () => void;
  onSaveProvider: ProviderSetupPanelProps["onSave"];
  onTestProvider: ProviderSetupPanelProps["onTest"];
  onOpenProviderUrl: (url: string) => void;
  onSaveWorkspaceProfile: (patch: {
    name?: string;
    description?: string | null;
  }) => Promise<void>;
  onSaveAssistantProfile: (patch: AssistantProfileUpdate) => Promise<void>;
  onOpenDiagnostics: () => void;
  onOpenRecoveryDetails?: () => void;
};

export function SettingsPanel({
  workspace,
  workspaceId,
  assistantProfile,
  appState,
  autosaveStatus,
  workspaceHealth,
  healthLoading,
  timelineGroups,
  providerConfig,
  localAiStatus,
  embeddedAiConsumerStatus,
  providerPanel,
  focusLocalAiSignal = 0,
  onBackToChat,
  onConnectAi,
  onSaveProvider,
  onTestProvider,
  onOpenProviderUrl,
  onSaveWorkspaceProfile,
  onSaveAssistantProfile,
  onOpenDiagnostics,
  onOpenRecoveryDetails,
}: Props) {
  return (
    <div className="settings-panel" data-testid="settings-panel" aria-label="Settings">
      <AssistantSettingsSection profile={assistantProfile} onSave={onSaveAssistantProfile} />

      <AiConnectionStatusSection
        appState={appState}
        localAiStatus={localAiStatus}
        embeddedAiConsumerStatus={embeddedAiConsumerStatus}
        onConnectAi={onConnectAi}
      />

      <WorkspaceProfileSection workspace={workspace} onSave={onSaveWorkspaceProfile} />

      <section>
        <h3>Activity</h3>
        {timelineGroups.length === 0 ? (
          <p className="muted small">{SETTINGS_ACTIVITY_EMPTY}</p>
        ) : (
          <TimelinePanel groups={timelineGroups} />
        )}
      </section>

      <details className="settings-advanced" data-testid="settings-advanced">
        <summary>Advanced</summary>

        <section className="settings-ai-providers" data-testid="settings-ai-providers">
          <h3>AI Providers</h3>
          <p className="muted small">
            Local Polaris configuration and advanced app settings.
          </p>
          {workspaceId && providerPanel ? (
            <ProvidersCenterPanel
              appState={appState}
              providerConfig={providerConfig}
              localAiStatus={localAiStatus}
              embeddedAiConsumerStatus={embeddedAiConsumerStatus}
              providerPanel={providerPanel}
              focusLocalAiSignal={focusLocalAiSignal}
              onBackToChat={onBackToChat}
              workspaceId={workspaceId}
              onSaveProvider={onSaveProvider}
              onTestProvider={onTestProvider}
              onOpenUrl={onOpenProviderUrl}
            />
          ) : (
            <p className="muted small">Open a workspace to manage AI providers.</p>
          )}
        </section>

        <section>
          <h3>Workspace health</h3>
          <ReliabilityIndicators appState={appState} autosave={autosaveStatus} />
          <WorkspaceHealthPanel
            health={workspaceHealth}
            autosave={autosaveStatus}
            loading={healthLoading}
          />
          <div className="settings-panel-actions">
            <button type="button" className="secondary small-btn" onClick={onOpenDiagnostics}>
              Open diagnostics
            </button>
            {onOpenRecoveryDetails && (
              <button type="button" className="secondary small-btn" onClick={onOpenRecoveryDetails}>
                Recovery details
              </button>
            )}
          </div>
        </section>
      </details>
    </div>
  );
}


