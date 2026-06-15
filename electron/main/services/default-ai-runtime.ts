import type Database from "better-sqlite3";
import type { AppState, LocalAiStatus } from "../../../src/shared/types";
import {
  DEFAULT_AI_ROUTE_LABEL,
  loadDefaultHostedAiConfig,
  type DefaultAiRouteSource,
  type DefaultAiRouteStatus,
} from "../../../src/shared/default-ai-config";
import {
  AI_CONNECT_MESSAGE,
  AI_UNAVAILABLE_MESSAGE,
} from "../../../src/shared/consumer-experience-copy";
import {
  AI_STATUS_DOWNLOADING,
  AI_STATUS_MANUAL,
  AI_STATUS_NEEDS_ATTENTION,
  AI_STATUS_PREPARING,
  AI_STATUS_READY,
  AI_USE_CLOUD_ACTION,
  buildAiReadinessView,
  type AiReadinessStatus,
} from "../../../src/shared/ai-readiness";
import { resolveProvisioningReadiness } from "../../../src/shared/provisioning-readiness";
import { isOllamaOnlyChatMode } from "../../../src/shared/ollama-only-mode";
import { OLLAMA_USER_MESSAGES } from "../../../src/shared/ollama-canonical-status";
import { getProviderDefinition } from "../../../src/shared/provider-definitions";
import { secureStorage } from "../secure-storage";
import { getProviderAdapter } from "../providers";
import { isProviderRuntimeReady } from "./provider-runtime";
import { testProviderConnection } from "./provider-connection-test";
import { bootstrapLocalAiOnStartup } from "./local-ai-bootstrap";
import { EMBEDDED_AI_PREPARING_HEADLINE } from "../../../src/shared/embedded-local-ai-consumer";
import { getConsumerStatus } from "./embedded-local-ai-manager";
import { getProviderConfig } from "./provider-service";
import type { ResolvedChatProvider } from "./chat-provider-resolution";

export type DefaultAiRoute = {
  status: DefaultAiRouteStatus;
  source: DefaultAiRouteSource;
  providerId: string | null;
  model: string | null;
  baseUrl: string | null;
  displayName: string;
  consumerMessage: string;
  canReply: boolean;
  actionLabel?: string;
  advancedMessage?: string;
  providerReady: boolean;
  selectedProvider: string | null;
  providerReadinessStatus: AppState["providerReadinessStatus"];
  providerSetupRequired: boolean;
};

function providerDisplayName(providerId: string | null): string {
  if (!providerId) return DEFAULT_AI_ROUTE_LABEL;
  try {
    return getProviderDefinition(providerId).displayName;
  } catch {
    return DEFAULT_AI_ROUTE_LABEL;
  }
}

function mapTestToReadiness(
  status: string,
): AppState["providerReadinessStatus"] {
  const statusMap: Record<string, AppState["providerReadinessStatus"]> = {
    success: "ready",
    invalid_key: "invalid_key",
    network_error: "network_error",
    adapter_not_ready: "adapter_not_ready",
    ollama_not_running: "ollama_not_running",
    ollama_unreachable: "ollama_not_running",
    unknown_error: "network_error",
    quota_exceeded: "network_error",
    invalid_base_url: "network_error",
    model_missing: "ollama_not_running",
  };
  return statusMap[status] ?? "network_error";
}

function mapRouteStatus(status: DefaultAiRouteStatus): AiReadinessStatus {
  switch (status) {
    case "ready":
      return "ready";
    case "downloading":
      return "downloading";
    case "preparing":
    case "starting":
      return "preparing";
    case "needs_attention":
      return "needs_attention";
    case "manual_mode":
      return "manual_mode";
    default:
      return "unavailable";
  }
}

function buildRoute(partial: Omit<DefaultAiRoute, "canReply" | "providerReady"> & {
  canReply?: boolean;
}): DefaultAiRoute {
  const canReply = partial.canReply ?? partial.status === "ready";
  const readiness = buildAiReadinessView({
    status: mapRouteStatus(partial.status),
    canReply,
    consumerMessage: partial.consumerMessage,
    actionLabel: partial.actionLabel,
    advancedMessage: partial.advancedMessage,
  });
  return {
    ...partial,
    canReply: readiness.canReply,
    consumerMessage: readiness.consumerMessage,
    actionLabel: readiness.actionLabel ?? partial.actionLabel,
    advancedMessage: readiness.advancedMessage ?? partial.advancedMessage,
    providerReady: readiness.canReply,
  };
}

function readyRoute(input: {
  source: DefaultAiRouteSource;
  providerId: string;
  model: string;
  baseUrl: string | null;
}): DefaultAiRoute {
  return buildRoute({
    status: "ready",
    source: input.source,
    providerId: input.providerId,
    model: input.model,
    baseUrl: input.baseUrl,
    displayName: providerDisplayName(input.providerId),
    consumerMessage: AI_STATUS_READY,
    selectedProvider: input.providerId,
    providerReadinessStatus: "ready",
    providerSetupRequired: false,
    canReply: true,
  });
}

async function testHostedDefault(
  db: Database.Database,
  workspaceId: string,
): Promise<DefaultAiRoute | null> {
  const hosted = loadDefaultHostedAiConfig();
  if (!hosted) return null;

  const apiKey = secureStorage.getKey(hosted.keyRef)?.trim() ?? "";
  if (!apiKey) return null;

  const tested = await testProviderConnection(db, workspaceId, {
    provider: hosted.provider,
    model: hosted.model,
    baseUrl: hosted.baseUrl ?? undefined,
    apiKey,
  });
  if (!tested.ok) return null;

  return readyRoute({
    source: "hosted_default",
    providerId: hosted.provider,
    model: hosted.model,
    baseUrl: hosted.baseUrl,
  });
}

async function testUserProvider(
  db: Database.Database,
  workspaceId: string,
): Promise<DefaultAiRoute | null> {
  if (isOllamaOnlyChatMode()) return null;

  const config = getProviderConfig(db, workspaceId);
  if (!config?.enabled || config.provider === "ollama") return null;

  const tested = await testProviderConnection(db, workspaceId, {
    provider: config.provider,
    model: config.model,
    baseUrl: config.baseUrl ?? undefined,
  });
  if (!tested.ok) return null;

  return readyRoute({
    source: "user_provider",
    providerId: config.provider,
    model: config.model.trim() || getProviderDefinition(config.provider).recommendedModel,
    baseUrl: config.baseUrl ?? null,
  });
}

async function testLocalRoute(
  db: Database.Database,
  workspaceId: string,
  localStatus: LocalAiStatus,
): Promise<DefaultAiRoute | null> {
  if (localStatus.state !== "ollama_ready" || localStatus.models.length === 0) {
    return null;
  }
  const config = getProviderConfig(db, workspaceId);
  const configuredModel = config?.provider === "ollama" ? config.model.trim() : "";
  const model = pickLocalModel(localStatus, configuredModel || localStatus.selectedModel);
  const tested = await testProviderConnection(db, workspaceId, {
    provider: "ollama",
    model,
    baseUrl: localStatus.baseUrl,
  });
  if (!tested.ok) return null;

  return readyRoute({
    source: "local",
    providerId: "ollama",
    model,
    baseUrl: localStatus.baseUrl,
  });
}

function pickLocalModel(
  localStatus: LocalAiStatus,
  preferredModel?: string | null,
): string {
  const preferred = preferredModel?.trim();
  if (preferred && localStatus.models.includes(preferred)) {
    return preferred;
  }
  if (preferred) {
    const base = preferred.split(":")[0];
    const partial = localStatus.models.find(
      (model) => model === base || model.startsWith(`${base}:`),
    );
    if (partial) return preferred.includes(":") ? preferred : partial;
  }
  if (
    localStatus.selectedModel &&
    localStatus.models.includes(localStatus.selectedModel)
  ) {
    return localStatus.selectedModel;
  }
  return localStatus.models[0];
}

/** Detect local runtime and sync default provider row when possible. */
export async function attemptLocalAiStartup(
  db: Database.Database,
  workspaceId: string,
): Promise<LocalAiStatus> {
  return bootstrapLocalAiOnStartup(db, workspaceId);
}

/**
 * ContinuityOS Default AI route — priority:
 * 1. Local ContinuityOS AI when verified ready
 * 2. User-selected cloud provider when verified ready
 * 3. App-level hosted fallback when verified ready
 * 4. Manual mode (chat UI stays open)
 */
export async function resolveDefaultAiRoute(
  db: Database.Database,
  workspaceId: string | null,
): Promise<DefaultAiRoute> {
  const manualBase = buildRoute({
    status: "manual_mode",
    source: "manual",
    providerId: null,
    model: null,
    baseUrl: null,
    displayName: DEFAULT_AI_ROUTE_LABEL,
    consumerMessage: AI_CONNECT_MESSAGE,
    actionLabel: AI_USE_CLOUD_ACTION,
    selectedProvider: "ollama",
    providerReadinessStatus: "not_configured",
    providerSetupRequired: false,
    canReply: false,
  });

  if (!workspaceId) return manualBase;

  const embedded = getConsumerStatus();
  const provisioning = resolveProvisioningReadiness({
    embeddedPhase: embedded.phase,
    canReply: false,
    offline: embedded.offline,
  });

  if (embedded.phase === "downloading" || provisioning.state === "DOWNLOADING") {
    return buildRoute({
      status: "downloading",
      source: "local",
      providerId: "ollama",
      model: null,
      baseUrl: embedded.phase === "downloading" ? null : null,
      displayName: providerDisplayName("ollama"),
      consumerMessage: provisioning.consumerMessage || embedded.message || AI_STATUS_DOWNLOADING,
      selectedProvider: "ollama",
      providerReadinessStatus: "ollama_not_running",
      providerSetupRequired: false,
      canReply: false,
    });
  }

  if (
    embedded.phase === "checking" ||
    embedded.phase === "installing_runtime" ||
    embedded.phase === "starting_runtime" ||
    embedded.phase === "preparing" ||
    embedded.phase === "paused" ||
    embedded.phase === "offline_waiting"
  ) {
    return buildRoute({
      status: "preparing",
      source: "local",
      providerId: "ollama",
      model: null,
      baseUrl: null,
      displayName: providerDisplayName("ollama"),
      consumerMessage: provisioning.consumerMessage || embedded.message || EMBEDDED_AI_PREPARING_HEADLINE,
      selectedProvider: "ollama",
      providerReadinessStatus: "ollama_not_running",
      providerSetupRequired: false,
      canReply: false,
    });
  }

  if (embedded.phase === "failed" || provisioning.state === "FAILED") {
    return buildRoute({
      status: "needs_attention",
      source: "local",
      providerId: "ollama",
      model: null,
      baseUrl: null,
      displayName: providerDisplayName("ollama"),
      consumerMessage: provisioning.consumerMessage || AI_STATUS_NEEDS_ATTENTION,
      advancedMessage: embedded.detail,
      selectedProvider: "ollama",
      providerReadinessStatus: "network_error",
      providerSetupRequired: false,
      canReply: false,
    });
  }

  const localStatus = await attemptLocalAiStartup(db, workspaceId);

  const localReady = await testLocalRoute(db, workspaceId, localStatus);
  if (localReady) return localReady;

  if (!isOllamaOnlyChatMode()) {
    const userReady = await testUserProvider(db, workspaceId);
    if (userReady) return userReady;

    const hostedReady = await testHostedDefault(db, workspaceId);
    if (hostedReady) return hostedReady;
  }

  const hosted = isOllamaOnlyChatMode() ? null : loadDefaultHostedAiConfig();
  const hostedKeyMissing =
    !isOllamaOnlyChatMode() && Boolean(hosted && !secureStorage.getKey(hosted.keyRef)?.trim());

  if (localStatus.detected) {
    const missingModel = localStatus.state === "ollama_detected_no_model";
    return buildRoute({
      status: missingModel ? "downloading" : "preparing",
      source: "local",
      providerId: "ollama",
      model: localStatus.selectedModel,
      baseUrl: localStatus.baseUrl,
      displayName: providerDisplayName("ollama"),
      consumerMessage: missingModel ? AI_STATUS_DOWNLOADING : AI_STATUS_PREPARING,
      selectedProvider: "ollama",
      providerReadinessStatus: mapTestToReadiness(
        missingModel ? "model_missing" : "ollama_not_running",
      ),
      providerSetupRequired: false,
      canReply: false,
    });
  }

  if (hostedKeyMissing) {
    return buildRoute({
      status: "needs_provider",
      source: "hosted_default",
      providerId: hosted?.provider ?? null,
      model: hosted?.model ?? null,
      baseUrl: hosted?.baseUrl ?? null,
      displayName: DEFAULT_AI_ROUTE_LABEL,
      consumerMessage: AI_CONNECT_MESSAGE,
      actionLabel: AI_USE_CLOUD_ACTION,
      selectedProvider: hosted?.provider ?? "ollama",
      providerReadinessStatus: "missing_api_key",
      providerSetupRequired: false,
      canReply: false,
    });
  }

  return buildRoute({
    status: "needs_attention",
    source: "local",
    providerId: "ollama",
    model: localStatus.selectedModel,
    baseUrl: localStatus.baseUrl,
    displayName: providerDisplayName("ollama"),
    consumerMessage: embedded.detail || OLLAMA_USER_MESSAGES.verifyFailed,
    advancedMessage: embedded.lastError ?? localStatus.message,
    selectedProvider: "ollama",
    providerReadinessStatus: "ollama_not_running",
    providerSetupRequired: false,
    canReply: false,
  });
}

export function buildResolvedFromRoute(
  db: Database.Database,
  workspaceId: string,
  route: DefaultAiRoute,
): ResolvedChatProvider | null {
  if (!route.canReply || route.status !== "ready" || !route.providerId || !route.model) {
    return null;
  }

  const providerId = route.providerId;
  if (!isProviderRuntimeReady(providerId)) return null;

  const adapter = getProviderAdapter(providerId);
  if (!adapter) return null;

  const config = getProviderConfig(db, workspaceId);
  if (!config) return null;

  const def = getProviderDefinition(providerId);
  const model = route.model;

  if (def.localOnly) {
    const baseUrl = route.baseUrl?.trim() || def.defaultBaseUrl;
    if (!baseUrl || !adapter.isConfigured(baseUrl)) return null;
    return {
      config,
      providerId,
      model,
      connectionValue: baseUrl,
      requestBaseUrl: baseUrl,
    };
  }

  let apiKey = "";
  if (route.source === "hosted_default") {
    const hosted = loadDefaultHostedAiConfig();
    apiKey = hosted ? secureStorage.getKey(hosted.keyRef)?.trim() ?? "" : "";
  } else {
    const ref = secureStorage.buildRef(workspaceId, providerId);
    apiKey = secureStorage.getKey(ref)?.trim() ?? "";
  }

  if (!apiKey) return null;
  if (!adapter.isConfigured(apiKey)) return null;

  const requestBaseUrl =
    route.baseUrl?.trim() || config.baseUrl?.trim() || def.defaultBaseUrl || null;

  return {
    config,
    providerId,
    model,
    connectionValue: apiKey,
    requestBaseUrl,
  };
}

/** Resolve the active chat provider using the default AI priority chain. */
export async function resolveDefaultChatProvider(
  db: Database.Database,
  workspaceId: string,
): Promise<ResolvedChatProvider | null> {
  const route = await resolveDefaultAiRoute(db, workspaceId);
  return buildResolvedFromRoute(db, workspaceId, route);
}

