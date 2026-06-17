import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import type {
  EmbeddedLocalLlmGenerateResult,
  EmbeddedLocalLlmStatus,
  EmbeddedLocalModelProfile,
} from "../../../src/shared/types";

const EMBEDDED_MODEL_CATALOG: Array<
  Omit<EmbeddedLocalModelProfile, "installed" | "localPath">
> = [
  {
    id: "qwen3-1.7b-q4",
    displayName: "Qwen 3 1.7B Q4",
    fileName: "qwen3-1.7b-instruct-q4.gguf",
    sizeBytes: 1_800_000_000,
    quantization: "Q4",
    recommendedRamGb: 6,
    sourceUrl: null,
    tier: "small_fast",
  },
  {
    id: "llama3.2-3b-q4",
    displayName: "Llama 3.2 3B Q4",
    fileName: "llama-3.2-3b-instruct-q4.gguf",
    sizeBytes: 3_300_000_000,
    quantization: "Q4",
    recommendedRamGb: 8,
    sourceUrl: null,
    tier: "recommended",
  },
  {
    id: "mistral-7b-q4",
    displayName: "Mistral 7B Q4",
    fileName: "mistral-7b-instruct-v0.3-q4.gguf",
    sizeBytes: 4_800_000_000,
    quantization: "Q4",
    recommendedRamGb: 12,
    sourceUrl: null,
    tier: "higher_quality",
  },
];

function resolveUserDataDir(): string {
  const envPath = process.env.CONTINUITY_MODEL_DIR?.trim();
  if (envPath) {
    return envPath;
  }

  try {
    const electronPath = app.getPath("userData");
    if (electronPath?.trim()) {
      return path.join(electronPath, "models");
    }
  } catch {
    // Fallback for tests and non-Electron contexts.
  }

  return path.join(process.cwd(), "models");
}

export function getEmbeddedLocalModelDirectory(): string {
  return resolveUserDataDir();
}

export function listEmbeddedLocalModelProfiles(): EmbeddedLocalModelProfile[] {
  const modelDirectory = getEmbeddedLocalModelDirectory();
  return EMBEDDED_MODEL_CATALOG.map((profile) => {
    const localPath = path.join(modelDirectory, profile.fileName);
    return {
      ...profile,
      localPath,
      installed: fs.existsSync(localPath),
    };
  });
}

export function getEmbeddedLocalLlmStatus(): EmbeddedLocalLlmStatus {
  const modelDirectory = getEmbeddedLocalModelDirectory();
  const models = listEmbeddedLocalModelProfiles();
  const selectedModel = models.find((model) => model.installed) ?? null;
  const installedModelCount = models.filter((model) => model.installed).length;

  if (installedModelCount === 0) {
    return {
      engineType: "embedded-local",
      state: "model_missing",
      modelDirectory,
      selectedModelId: null,
      selectedModelPath: null,
      installedModelCount,
      models,
      message:
        "ContinuityOS AI is preparing in the background. You can keep chatting while it finishes.",
      availableForDirectChat: false,
      error: null,
    };
  }

  return {
    engineType: "embedded-local",
    state: "model_available",
    modelDirectory,
    selectedModelId: selectedModel?.id ?? null,
    selectedModelPath: selectedModel?.localPath ?? null,
    installedModelCount,
    models,
    message:
      "ContinuityOS AI files are present. Chat uses your built-in local AI when ready.",
    availableForDirectChat: false,
    error: null,
  };
}

export async function generateEmbeddedLocalResponse(): Promise<EmbeddedLocalLlmGenerateResult> {
  const status = getEmbeddedLocalLlmStatus();
  if (status.installedModelCount === 0) {
    return {
      ok: false,
      status: "MODEL_MISSING",
      content: null,
      model: null,
      message:
        "Built-in Local AI is not ready because no local model file is installed yet. Use Ollama for now, or add a supported model later.",
    };
  }

  return {
    ok: false,
    status: "NOT_READY",
    content: null,
    model: status.selectedModelId,
    message:
      "Built-in Local AI loading is scaffolded, but generation is not enabled in this build yet. Use Ollama or a Context Pack today.",
  };
}
