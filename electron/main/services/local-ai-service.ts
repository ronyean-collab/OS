import type Database from "better-sqlite3";
import { spawn, type ChildProcess } from "node:child_process";
import type { LocalAiStatus } from "../../../src/shared/types";
import { getProviderDefinition } from "../../../src/shared/provider-definitions";
import { AI_STATUS_PREPARING } from "../../../src/shared/ai-readiness";
import {
  AI_UNAVAILABLE_MESSAGE,
  LOCAL_AI_NOT_READY,
  LOCAL_AI_READY_MESSAGE,
} from "../../../src/shared/consumer-experience-copy";
import { buildOllamaProbeUrls, normalizeOllamaBaseUrl } from "../../../src/shared/ollama-endpoints";
import { getProviderBaseUrl, getProviderConfig, setProviderBaseUrl } from "./provider-service";

type OllamaTagsResponse = {
  models?: Array<{
    name?: string;
  }>;
};

const OLLAMA_DETECTION_TIMEOUT_MS = 1_500;
const OLLAMA_BOOTSTRAP_HOST = "127.0.0.1:11500";
const OLLAMA_BOOTSTRAP_BASE_URL = "http://127.0.0.1:11500";
const OLLAMA_BOOTSTRAP_TIMEOUT_MS = 30_000;
const OLLAMA_BOOTSTRAP_POLL_MS = 1_000;

let ollamaBootstrapProcess: ChildProcess | null = null;
let ollamaBootstrapPromise: Promise<{ baseUrl: string; models: string[] } | null> | null = null;
type LocalAiStatusTestDelegate = (
  db: Database.Database,
  workspaceId: string,
  preferredBaseUrl?: string | null,
) => Promise<LocalAiStatus>;

let localAiStatusTestDelegate: LocalAiStatusTestDelegate | null = null;

export function __setLocalAiStatusDelegateForTests(
  delegate: LocalAiStatusTestDelegate | null,
): void {
  localAiStatusTestDelegate = delegate;
}

export function __resetLocalAiServiceForTests(): void {
  localAiStatusTestDelegate = null;
  ollamaBootstrapPromise = null;
}


function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function startOllamaProcess(): void {
  if (ollamaBootstrapProcess && ollamaBootstrapProcess.exitCode === null) {
    return;
  }

  console.info("[ollama-bootstrap] starting", {
    host: OLLAMA_BOOTSTRAP_HOST,
  });

  const child = spawn("ollama", ["serve"], {
    env: {
      ...process.env,
      OLLAMA_HOST: OLLAMA_BOOTSTRAP_HOST,
    },
    windowsHide: true,
    stdio: "ignore",
  });

  ollamaBootstrapProcess = child;

  child.once("spawn", () => {
    console.info("[ollama-bootstrap] spawn started");
  });

  child.once("error", (error) => {
    console.info("[ollama-bootstrap] failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    if (ollamaBootstrapProcess === child) {
      ollamaBootstrapProcess = null;
    }
  });

  child.once("exit", (code, signal) => {
    console.info("[ollama-bootstrap] exited", {
      code,
      signal,
    });
    if (ollamaBootstrapProcess === child) {
      ollamaBootstrapProcess = null;
    }
  });

  child.unref();
}

async function ensureOllamaRunning(
  db: Database.Database,
  workspaceId: string,
  preferredBaseUrl?: string | null,
): Promise<{ baseUrl: string; models: string[] } | null> {
  console.info("[ollama-bootstrap] checking", {
    preferredBaseUrl: preferredBaseUrl ?? null,
  });

  const alreadyRunning = await discoverOllamaEndpoint(db, workspaceId, preferredBaseUrl);
  if (alreadyRunning) {
    console.info("[ollama-bootstrap] already running", {
      baseUrl: alreadyRunning.baseUrl,
      models: alreadyRunning.models,
    });
    return alreadyRunning;
  }

  if (ollamaBootstrapPromise) {
    return ollamaBootstrapPromise;
  }

  ollamaBootstrapPromise = (async () => {
    startOllamaProcess();

    const startedAt = Date.now();
    while (Date.now() - startedAt < OLLAMA_BOOTSTRAP_TIMEOUT_MS) {
      await sleep(OLLAMA_BOOTSTRAP_POLL_MS);

      const detected = await discoverOllamaEndpoint(
        db,
        workspaceId,
        preferredBaseUrl ?? OLLAMA_BOOTSTRAP_BASE_URL,
      );

      if (detected) {
        console.info("[ollama-bootstrap] ready", {
          baseUrl: detected.baseUrl,
          models: detected.models,
        });

        if (detected.models.includes("llama3.2:3b")) {
          console.info("[ollama-bootstrap] model available", {
            model: "llama3.2:3b",
          });
        } else {
          console.info("[ollama-bootstrap] model missing", {
            model: "llama3.2:3b",
            models: detected.models,
          });
        }

        return detected;
      }
    }

    console.info("[ollama-bootstrap] timeout", {
      timeoutMs: OLLAMA_BOOTSTRAP_TIMEOUT_MS,
    });
    return null;
  })();

  try {
    return await ollamaBootstrapPromise;
  } finally {
    ollamaBootstrapPromise = null;
  }
}

function buildOllamaBaseUrlCandidates(input: {
  preferredBaseUrl?: string | null;
  configuredBaseUrl?: string | null;
}): string[] {
  const e2eHostOnly = process.env.CONTINUITY_E2E_OLLAMA_HOST_ONLY === "1";
  const envHost = normalizeOllamaBaseUrl(process.env.OLLAMA_HOST);

  if (e2eHostOnly && envHost) {
    return [envHost];
  }

  const candidates = [
    normalizeOllamaBaseUrl(input.preferredBaseUrl),
    normalizeOllamaBaseUrl(input.configuredBaseUrl),
    ...buildOllamaProbeUrls(),
    ...(e2eHostOnly ? [] : [normalizeOllamaBaseUrl(getProviderDefinition("ollama").defaultBaseUrl)]),
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
  if (localAiStatusTestDelegate) {
    return localAiStatusTestDelegate(db, workspaceId, preferredBaseUrl);
  }
  const currentConfig = getProviderConfig(db, workspaceId);
  const configuredBaseUrl =
    normalizeOllamaBaseUrl(preferredBaseUrl) ??
    normalizeOllamaBaseUrl(getProviderBaseUrl(db, workspaceId, "ollama")) ??
    normalizeOllamaBaseUrl(getProviderDefinition("ollama").defaultBaseUrl) ??
    "http://localhost:11434";
  const selected = currentConfig?.provider === "ollama";
  const selectedModel = selected ? currentConfig?.model ?? null : null;

  try {
    const detected = await ensureOllamaRunning(db, workspaceId, preferredBaseUrl);
    if (!detected) {
      return {
        state: "ollama_not_detected",
        detected: false,
        baseUrl: configuredBaseUrl,
        models: [],
        selected,
        selectedModel,
        message: AI_STATUS_PREPARING,
        error: "Local AI endpoint not found.",
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
        models.length > 0 ? LOCAL_AI_READY_MESSAGE : LOCAL_AI_NOT_READY,
      error: null,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Local AI is unavailable.";
    return {
      state: /HTTP|returned/i.test(errorMessage) ? "ollama_error" : "ollama_not_detected",
      detected: false,
      baseUrl: configuredBaseUrl,
      models: [],
      selected,
      selectedModel,
      message: /HTTP|returned/i.test(errorMessage) ? AI_UNAVAILABLE_MESSAGE : AI_STATUS_PREPARING,
      error: errorMessage,
    };
  }
}

