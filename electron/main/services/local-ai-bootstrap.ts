import type Database from "better-sqlite3";
import type { LocalAiStatus } from "../../../src/shared/types";
import { getProviderDefinition } from "../../../src/shared/provider-definitions";
import {
  getOllamaProviderConfig,
  getProviderConfig,
  saveProviderConfig,
} from "./provider-service";
import { getLocalAiStatus } from "./local-ai-service";

/** ContinuityOS treats local AI (Ollama) as the built-in default engine. */
export function ensureDefaultContinuityAiProvider(
  db: Database.Database,
  workspaceId: string,
): void {
  const active = getProviderConfig(db, workspaceId);
  if (active?.enabled) return;

  const ollama = getOllamaProviderConfig(db, workspaceId);
  if (ollama) {
    saveProviderConfig(
      db,
      workspaceId,
      "ollama",
      ollama.model,
      "",
      ollama.baseUrl ?? getProviderDefinition("ollama").defaultBaseUrl,
    );
    return;
  }

  const def = getProviderDefinition("ollama");
  saveProviderConfig(db, workspaceId, "ollama", def.recommendedModel, "", def.defaultBaseUrl);
}

export async function bootstrapLocalAiOnStartup(
  db: Database.Database,
  workspaceId: string,
): Promise<LocalAiStatus> {
  ensureDefaultContinuityAiProvider(db, workspaceId);
  const status = await getLocalAiStatus(db, workspaceId);
  if (status.detected && status.models.length > 0) {
    const config = getProviderConfig(db, workspaceId);
    const preferred = config?.provider === "ollama" ? config.model : status.selectedModel;
    const model = pickDetectedLocalModel(status, preferred);
    saveProviderConfig(db, workspaceId, "ollama", model, "", status.baseUrl);
  }
  return status;
}

function pickDetectedLocalModel(
  status: LocalAiStatus,
  preferredModel?: string | null,
): string {
  const preferred = preferredModel?.trim();
  if (preferred && status.models.includes(preferred)) return preferred;
  if (preferred) {
    const base = preferred.split(":")[0];
    const partial = status.models.find(
      (model) => model === base || model.startsWith(`${base}:`),
    );
    if (partial) return preferred.includes(":") ? preferred : partial;
  }
  if (status.selectedModel && status.models.includes(status.selectedModel)) {
    return status.selectedModel;
  }
  return status.models[0];
}
