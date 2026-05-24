import { v4 as uuid } from "uuid";
import type Database from "better-sqlite3";
import type { ProviderConfig } from "../../../src/shared/types";
import { PROVIDER_SECURE_STORAGE_ERROR } from "../../../src/shared/provider-errors";
import { getProviderDefinition } from "../../../src/shared/provider-definitions";
import { isProviderRuntimeReady } from "./provider-runtime";
import {
  secureStorage,
  __setSecureStorageForTests,
} from "../secure-storage";
import type { SecureStorageAdapter } from "../secure-storage/types";
import { appendTimelineEvent, enqueueSyncPlaceholder } from "./continuity-service";
import { getMeta, setMeta } from "./workspace-service";

export { __setSecureStorageForTests };

function storage(): SecureStorageAdapter {
  return secureStorage;
}

function providerBaseUrlMetaKey(workspaceId: string, provider: string): string {
  return `provider_base_url_${workspaceId}_${provider}`;
}

export function getProviderBaseUrl(
  db: Database.Database,
  workspaceId: string,
  provider: string,
): string | null {
  return getMeta(db, providerBaseUrlMetaKey(workspaceId, provider));
}

export function setProviderBaseUrl(
  db: Database.Database,
  workspaceId: string,
  provider: string,
  baseUrl: string | null,
): void {
  const key = providerBaseUrlMetaKey(workspaceId, provider);
  if (baseUrl?.trim()) {
    setMeta(db, key, baseUrl.trim());
  } else {
    db.prepare("DELETE FROM app_meta WHERE key = ?").run(key);
  }
}

function mapConfig(db: Database.Database, row: Record<string, unknown>): ProviderConfig {
  if (!row || typeof row !== "object") {
    throw new Error("Provider configuration row is missing after save.");
  }
  const workspaceId = String(row.workspace_id);
  const provider = String(row.provider);
  const ref =
    row.secure_key_ref != null
      ? String(row.secure_key_ref)
      : storage().buildRef(workspaceId, provider);
  const def = getProviderDefinition(provider);
  return {
    id: String(row.id),
    workspaceId,
    provider,
    displayName: def.displayName,
    model: String(row.model),
    enabled: Boolean(row.enabled),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    hasApiKey: storage().hasKey(ref),
    baseUrl: getProviderBaseUrl(db, workspaceId, provider) ?? def.defaultBaseUrl,
    providerStatus: def.status,
    runtimeReady: isProviderRuntimeReady(provider),
  };
}

export function getProviderConfig(
  db: Database.Database,
  workspaceId: string,
): ProviderConfig | null {
  const row = db
    .prepare(
      "SELECT * FROM provider_configs WHERE workspace_id = ? ORDER BY updated_at DESC LIMIT 1",
    )
    .get(workspaceId) as Record<string, unknown> | undefined;
  return row ? mapConfig(db, row) : null;
}

export function removeProviderApiKey(
  db: Database.Database,
  workspaceId: string,
  provider: string,
): void {
  const normalizedProvider = provider.trim().toLowerCase();
  const ref = storage().buildRef(workspaceId, normalizedProvider);
  storage().deleteKey(ref);
}

function storeApiKeyOrThrow(ref: string, apiKey: string): void {
  const result = storage().setKey(ref, apiKey.trim());
  if (!result.ok) {
    throw new Error(PROVIDER_SECURE_STORAGE_ERROR);
  }
}

export function saveProviderConfig(
  db: Database.Database,
  workspaceId: string,
  provider: string,
  model: string,
  apiKey: string,
  baseUrl?: string | null,
): ProviderConfig {
  const normalizedProvider = provider.trim().toLowerCase();
  const def = getProviderDefinition(normalizedProvider);
  const normalizedModel = model.trim() || def.recommendedModel;
  const ref = storage().buildRef(workspaceId, normalizedProvider);

  if (def.requiresApiKey) {
    if (apiKey.trim()) {
      storeApiKeyOrThrow(ref, apiKey);
    } else if (!storage().hasKey(ref)) {
      throw new Error(`An API key is required for ${def.displayName}.`);
    }
  }

  const resolvedBaseUrl =
    baseUrl?.trim() || def.defaultBaseUrl || getProviderBaseUrl(db, workspaceId, normalizedProvider);
  if (def.requiresBaseUrl && !resolvedBaseUrl) {
    throw new Error(`A base URL is required for ${def.displayName}.`);
  }
  if (resolvedBaseUrl) {
    setProviderBaseUrl(db, workspaceId, normalizedProvider, resolvedBaseUrl);
  }

  const existing = db
    .prepare("SELECT id FROM provider_configs WHERE workspace_id = ? AND provider = ?")
    .get(workspaceId, normalizedProvider) as { id: string } | undefined;

  const now = new Date().toISOString();
  const id = existing?.id ?? uuid();

  if (existing) {
    db.prepare(
      `UPDATE provider_configs SET model = ?, enabled = 1, secure_key_ref = ?, updated_at = ? WHERE id = ?`,
    ).run(normalizedModel, ref, now, id);
  } else {
    db.prepare(
      `INSERT INTO provider_configs (id, workspace_id, provider, model, enabled, secure_key_ref, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, ?, ?, ?)`,
    ).run(id, workspaceId, normalizedProvider, normalizedModel, ref, now, now);
  }

  appendTimelineEvent(db, {
    workspaceId,
    type: "provider_configured",
    title: "Provider configured",
    description: `${def.displayName} / ${normalizedModel}`,
  });

  enqueueSyncPlaceholder(db, workspaceId, "provider_config", id, "upsert", {
    provider: normalizedProvider,
    model: normalizedModel,
  });

  const saved =
    (db
      .prepare(
        "SELECT * FROM provider_configs WHERE workspace_id = ? AND provider = ?",
      )
      .get(workspaceId, normalizedProvider) as Record<string, unknown> | undefined) ??
    (db
      .prepare("SELECT * FROM provider_configs WHERE id = ?")
      .get(id) as Record<string, unknown> | undefined);

  if (!saved) {
    throw new Error("Provider configuration could not be read back after save.");
  }

  return mapConfig(db, saved);
}

export function getSecureStorageDiagnostics() {
  return storage().getDiagnostics();
}
