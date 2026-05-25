import type Database from "better-sqlite3";
import type { LocalAiStatus } from "../../../src/shared/types";
import { getProviderDefinition } from "../../../src/shared/provider-definitions";
import { getProviderBaseUrl, getProviderConfig } from "./provider-service";

type OllamaTagsResponse = {
  models?: Array<{
    name?: string;
  }>;
};

function resolveOllamaBaseUrl(db: Database.Database, workspaceId: string): string {
  return (
    getProviderBaseUrl(db, workspaceId, "ollama") ??
    getProviderDefinition("ollama").defaultBaseUrl ??
    "http://localhost:11434"
  );
}

export async function listOllamaModels(baseUrl: string): Promise<string[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/tags`, {
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Ollama returned HTTP ${response.status}.`);
    }
    const body = (await response.json()) as OllamaTagsResponse;
    return (body.models ?? [])
      .map((model) => model.name?.trim() ?? "")
      .filter(Boolean);
  } finally {
    clearTimeout(timeout);
  }
}

export async function getLocalAiStatus(
  db: Database.Database,
  workspaceId: string,
): Promise<LocalAiStatus> {
  const currentConfig = getProviderConfig(db, workspaceId);
  const baseUrl = resolveOllamaBaseUrl(db, workspaceId);
  const selected = currentConfig?.provider === "ollama";
  const selectedModel = selected ? currentConfig?.model ?? null : null;

  try {
    const models = await listOllamaModels(baseUrl);
    return {
      detected: true,
      baseUrl,
      models,
      selected,
      selectedModel,
      message:
        models.length > 0
          ? "Local AI is ready. ContinuityOS can answer using your selected local model."
          : "Ollama is reachable, but no local models were listed yet. Run `ollama pull <model>` first.",
    };
  } catch {
    return {
      detected: false,
      baseUrl,
      models: [],
      selected,
      selectedModel,
      message:
        "Local AI is not running yet. Install/start Ollama or continue with Manual Mode.",
    };
  }
}
