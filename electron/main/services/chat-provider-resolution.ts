import type Database from "better-sqlite3";
import type { ProviderConfig } from "../../../src/shared/types";
import { getProviderDefinition } from "../../../src/shared/provider-definitions";
import { isOllamaOnlyChatMode } from "../../../src/shared/ollama-only-mode";
import { getProviderAdapter } from "../providers";
import { secureStorage } from "../secure-storage";
import { isProviderRuntimeReady } from "./provider-runtime";
import {
  getProviderBaseUrl,
  getProviderConfig,
  getProviderConfigById,
} from "./provider-service";

export type ResolvedChatProvider = {
  config: ProviderConfig;
  providerId: string;
  model: string;
  connectionValue: string;
  requestBaseUrl: string | null;
};

export function resolveChatProvider(
  db: Database.Database,
  workspaceId: string,
): ResolvedChatProvider | null {
  const config = getProviderConfig(db, workspaceId);
  if (!config?.enabled) {
    return null;
  }

  const providerId = config.provider;
  const def = getProviderDefinition(providerId);

  if (isOllamaOnlyChatMode() && !def.localOnly) {
    return null;
  }

  if (!isProviderRuntimeReady(providerId)) {
    return null;
  }

  const adapter = getProviderAdapter(providerId);
  if (!adapter) {
    return null;
  }

  const model = config.model.trim() || def.recommendedModel;

  if (def.localOnly) {
    const baseUrl =
      config.baseUrl?.trim() || getProviderBaseUrl(db, workspaceId, providerId) || def.defaultBaseUrl;
    if (!baseUrl || !adapter.isConfigured(baseUrl)) {
      return null;
    }
    return {
      config,
      providerId,
      model,
      connectionValue: baseUrl,
      requestBaseUrl: baseUrl,
    };
  }

  const ref = secureStorage.buildRef(workspaceId, providerId);
  const apiKey = secureStorage.getKey(ref);
  if (!def.requiresApiKey || !apiKey?.trim()) {
    return null;
  }
  if (!adapter.isConfigured(apiKey)) {
    return null;
  }

  const requestBaseUrl =
    config.baseUrl?.trim() || getProviderBaseUrl(db, workspaceId, providerId) || def.defaultBaseUrl;

  return {
    config,
    providerId,
    model,
    connectionValue: apiKey,
    requestBaseUrl: requestBaseUrl ?? null,
  };
}

export function calmProviderUnavailableMessage(providerId: string): string {
  const def = getProviderDefinition(providerId);
  if (def.localOnly) {
    return `${def.displayName} isn't ready yet. Try again in Settings ? AI Providers, or use another provider.`;
  }
  return `${def.displayName} isn't ready yet. Check Settings ? AI Providers and try again.`;
}

export function loadProviderConfigForSetup(
  db: Database.Database,
  workspaceId: string,
  providerId: string,
): ProviderConfig | null {
  return getProviderConfigById(db, workspaceId, providerId);
}
