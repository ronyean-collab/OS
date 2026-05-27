import type Database from "better-sqlite3";
import type { LocalAiStatus } from "../../../src/shared/types";
import { getProviderDefinition } from "../../../src/shared/provider-definitions";
import { getProviderBaseUrl, getProviderConfig, setProviderBaseUrl } from "./provider-service";

type OllamaTagsResponse = {
  models?: Array<{
    name?: string;
  }>;
};

const DEFAULT_OLLAMA_BASE_URLS = [
  "http://localhost:11434",
  "http://127.0.0.1:11434",
  "http://localhost:11500",
  "http://127.0.0.1:11500",
];

const OLLAMA_DETECTION_TIMEOUT_MS = 1_500;

function normalizeOllamaBaseUrl(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  const withProtocol =
    /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  try {
    const url = new URL(withProtocol);
    url.pathname = "";
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function buildOllamaBaseUrlCandidates(input: {
  preferredBaseUrl?: string | null;
  configuredBaseUrl?: string | null;
}): string[] {
  const candidates = [
    normalizeOllamaBaseUrl(process.env.OLLAMA_HOST),
    normalizeOllamaBaseUrl(input.preferredBaseUrl),
    normalizeOllamaBaseUrl(input.configuredBaseUrl),
    normalizeOllamaBaseUrl(getProviderDefinition("ollama").defaultBaseUrl),
    ...DEFAULT_OLLAMA_BASE_URLS.map((value) => normalizeOllamaBaseUrl(value)),
  ].filter((value): value is string => Boolean(value));

  return [...new Set(candidates)];
}

export async function listOllamaModels(baseUrl: string): Promise<string[]> {
  const normalizedBaseUrl = normalizeOllamaBaseUrl(baseUrl);
  if (!normalizedBaseUrl) {
    throw new Error("Ollama base URL is invalid.");
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OLLAMA_DETECTION_TIMEOUT_MS);
  try {
    const response = await fetch(`${normalizedBaseUrl}/api/tags`, {
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

async function discoverOllamaEndpoint(
  db: Database.Database,
  workspaceId: string,
  preferredBaseUrl?: string | null,
): Promise<{ baseUrl: string; models: string[] } | null> {
  const configuredBaseUrl = getProviderBaseUrl(db, workspaceId, "ollama");
  const candidates = buildOllamaBaseUrlCandidates({
    preferredBaseUrl,
    configuredBaseUrl,
  });

  for (const candidate of candidates) {
    try {
      const models = await listOllamaModels(candidate);
      setProviderBaseUrl(db, workspaceId, "ollama", candidate);
      return {
        baseUrl: candidate,
        models,
      };
    } catch {
      continue;
    }
  }

  return null;
}

export async function getLocalAiStatus(
  db: Database.Database,
  workspaceId: string,
  preferredBaseUrl?: string | null,
): Promise<LocalAiStatus> {
  const currentConfig = getProviderConfig(db, workspaceId);
  const configuredBaseUrl =
    normalizeOllamaBaseUrl(preferredBaseUrl) ??
    normalizeOllamaBaseUrl(getProviderBaseUrl(db, workspaceId, "ollama")) ??
    normalizeOllamaBaseUrl(getProviderDefinition("ollama").defaultBaseUrl) ??
    "http://localhost:11434";
  const selected = currentConfig?.provider === "ollama";
  const selectedModel = selected ? currentConfig?.model ?? null : null;

  try {
    const detected = await discoverOllamaEndpoint(db, workspaceId, preferredBaseUrl);
    if (!detected) {
      return {
        state: "ollama_not_detected",
        detected: false,
        baseUrl: configuredBaseUrl,
        models: [],
        selected,
        selectedModel,
        message:
          "Install or start Ollama. If it is already running on another local port, enter that URL below and try Detect Ollama again.",
        error: "Ollama endpoint not found.",
      };
    }
    const { baseUrl, models } = detected;
    return {
      state: models.length > 0 ? "ollama_ready" : "ollama_detected_no_model",
      detected: true,
      baseUrl,
      models,
      selected,
      selectedModel,
      message:
        models.length > 0
          ? "Ollama is ready. ContinuityOS can answer here with your selected local model."
          : "Ollama is reachable, but no local models were listed yet. Run `ollama pull llama3.1` first.",
      error: null,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Ollama is unavailable.";
    return {
      state: /HTTP|returned/i.test(errorMessage) ? "ollama_error" : "ollama_not_detected",
      detected: false,
      baseUrl: configuredBaseUrl,
      models: [],
      selected,
      selectedModel,
      message:
        /HTTP|returned/i.test(errorMessage)
          ? "Ollama responded with an error. Retry and verify the base URL before sending another message."
          : "Ollama is not running yet. Install or start Ollama to enable in-app AI replies.",
      error: errorMessage,
    };
  }
}
