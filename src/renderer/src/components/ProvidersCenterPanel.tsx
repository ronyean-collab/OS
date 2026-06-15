import type { AppState, EmbeddedAiConsumerStatus, LocalAiStatus, ProviderConfig, ProviderTestResult } from "@shared/types";
import {
  getProviderDefinition,
  listVisibleProviderDefinitions,
  providerStatusLabel,
} from "@shared/provider-definitions";
import { ProviderSetupPanel, type ProviderSetupPanelProps } from "./ProviderSetupPanel";
import { CloudProviderSetupCard } from "./CloudProviderSetupCard";
import { resolveProviderStatusPresentation } from "@shared/startup-flow";
import { isOllamaOnlyChatMode } from "@shared/ollama-only-mode";

type Props = {
  appState: AppState | null;
  providerConfig: ProviderConfig | null;
  localAiStatus: LocalAiStatus | null;
  providerPanel: ProviderSetupPanelProps | null;
  focusLocalAiSignal?: number;
  embeddedAiConsumerStatus?: EmbeddedAiConsumerStatus | null;
  onBackToChat?: () => void;
  onSaveProvider: ProviderSetupPanelProps["onSave"];
  onTestProvider: ProviderSetupPanelProps["onTest"];
  onOpenUrl: (url: string) => void;
  workspaceId: string;
};

export function ProvidersCenterPanel({
  appState,
  providerConfig,
  localAiStatus,
  providerPanel,
  focusLocalAiSignal = 0,
  embeddedAiConsumerStatus = null,
  onBackToChat,
  onSaveProvider,
  onTestProvider,
  onOpenUrl,
  workspaceId,
}: Props) {
  const canReply = Boolean(appState?.defaultAiCanReply ?? appState?.providerReady);
  const presentation = resolveProviderStatusPresentation({
    providerReady: canReply,
    providerReadinessStatus: appState?.providerReadinessStatus ?? "not_configured",
    model: providerConfig?.model ?? localAiStatus?.selectedModel ?? null,
  });
  const activeId = appState?.selectedProvider ?? providerConfig?.provider ?? null;
  const activeDef = activeId ? getProviderDefinition(activeId) : null;
  const ollamaOnly = isOllamaOnlyChatMode();
  const cloudProviders = ollamaOnly ? [] : listVisibleProviderDefinitions().filter((def) => !def.localOnly);

  return (
    <div className="providers-center" data-testid="providers-center">
      <section className="providers-center-active">
        <h3>Active provider</h3>
        <div className={`provider-status-card tone-${presentation.tone}`}>
          <p className="provider-status-label">{presentation.label}</p>
          <p className="muted small">{presentation.composerHint}</p>
          <dl className="provider-status-meta">
            <dt>Active AI</dt>
            <dd>{activeDef?.displayName ?? "ContinuityOS Default AI"}</dd>
            <dt>Model</dt>
            <dd className="mono">{providerConfig?.model ?? localAiStatus?.selectedModel ?? "-"}</dd>
            <dt>Health</dt>
            <dd>
              {appState?.runtimeHealthScore != null
                ? `${Math.round(appState.runtimeHealthScore * 100)}% runtime health`
                : "-"}
            </dd>
          </dl>
        </div>
      </section>

      <section className="providers-center-catalog">
        <h3>Available providers</h3>
        <p className="muted small">
          Switch providers anytime - conversation history and continuity stay in your workspace.
          The same assistant identity applies to every engine.
        </p>
        <ul className="provider-catalog-list">
          {listVisibleProviderDefinitions().map((def) => (
            <li
              key={def.id}
              className={`provider-catalog-item${activeId === def.id ? " is-active" : ""}`}
              data-testid={`provider-catalog-${def.id}`}
            >
              <span className="provider-catalog-name">{def.displayName}</span>
              <span className="muted small">{providerStatusLabel(def.status)}</span>
            </li>
          ))}
        </ul>
      </section>

      {providerPanel && (
        <section className="providers-center-setup">
          <h3>Polaris Local Engine</h3>
          <ProviderSetupPanel
            {...providerPanel}
            focusLocalAiSignal={focusLocalAiSignal}
            embeddedAiConsumerStatus={embeddedAiConsumerStatus}
            canReply={canReply}
            onBackToChat={onBackToChat}
          />
        </section>
      )}
      {!ollamaOnly && cloudProviders.length > 0 && (
        <section className="providers-center-cloud">
          <h3>Cloud providers</h3>
          <p className="muted small">
            API keys are stored in OS secure storage only - never in the database or exports.
          </p>
          <div className="provider-cloud-grid">
            {cloudProviders.map((def) => (
              <CloudProviderSetupCard
                key={def.id}
                providerId={def.id}
                workspaceId={workspaceId}
                initial={providerConfig?.provider === def.id ? providerConfig : null}
                isActive={activeId === def.id && Boolean(providerConfig?.enabled)}
                onSave={onSaveProvider}
                onTest={onTestProvider}
                onOpenUrl={onOpenUrl}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}






