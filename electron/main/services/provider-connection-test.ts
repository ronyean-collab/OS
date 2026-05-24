import OpenAI from "openai";
import type Database from "better-sqlite3";
import type { ProviderTestResult } from "../../../src/shared/types";
import { getProviderDefinition } from "../../../src/shared/provider-definitions";
import { secureStorage } from "../secure-storage";
import { getProviderBaseUrl, getProviderConfig } from "./provider-service";
import { isProviderRuntimeReady } from "./provider-runtime";

export function mapOpenAIError(err: unknown): ProviderTestResult {
  if (err instanceof OpenAI.APIError) {
    if (err.status === 401) {
      return {
        ok: false,
        status: "invalid_key",
        message:
          "Invalid API key. Create a new key in your provider dashboard and try again.",
      };
    }
    if (err.status === 429) {
      return {
        ok: false,
        status: "quota_exceeded",
        message:
          "Rate or billing limit reached. Check usage and billing on your provider account.",
      };
    }
    return {
      ok: false,
      status: "unknown_error",
      message: err.message || `Provider returned error ${err.status}.`,
    };
  }

  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();
  if (
    lower.includes("fetch") ||
    lower.includes("network") ||
    lower.includes("econnrefused") ||
    lower.includes("enotfound") ||
    lower.includes("timeout") ||
    lower.includes("socket")
  ) {
    return {
      ok: false,
      status: "network_error",
      message: "Network error. Check your internet connection and try again.",
    };
  }

  return {
    ok: false,
    status: "unknown_error",
    message: message || "Connection test failed.",
  };
}

export async function testOpenAIConnection(
  apiKey: string,
  model: string,
): Promise<ProviderTestResult> {
  const key = apiKey.trim();
  if (!key) {
    return {
      ok: false,
      status: "invalid_key",
      message: "Enter an API key before testing the connection.",
    };
  }

  const def = getProviderDefinition("openai");

  try {
    const client = new OpenAI({ apiKey: key, timeout: 20_000 });
    await client.chat.completions.create({
      model: model.trim() || def.recommendedModel,
      messages: [{ role: "user", content: "ping" }],
      max_tokens: 1,
    });
    return {
      ok: true,
      status: "success",
      message: "Connected successfully. OpenAI is ready for chat.",
    };
  } catch (err) {
    return mapOpenAIError(err);
  }
}

export async function testOllamaConnection(
  baseUrl: string,
  model: string,
): Promise<ProviderTestResult> {
  const url = `${baseUrl.replace(/\/$/, "")}/api/tags`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) {
      return {
        ok: false,
        status: "ollama_unreachable",
        message: `Local Ollama server not reachable (${res.status}). Is Ollama running?`,
      };
    }
    const body = (await res.json()) as { models?: Array<{ name?: string }> };
    const names = (body.models ?? []).map((m) => m.name ?? "").filter(Boolean);
    const wanted = model.trim();
    if (wanted && names.length > 0 && !names.some((n) => n.startsWith(wanted))) {
      return {
        ok: true,
        status: "success",
        message: `Ollama is reachable. Model “${wanted}” was not listed — run: ollama pull ${wanted}`,
      };
    }
    return {
      ok: true,
      status: "success",
      message: "Connected successfully. Local Ollama server is reachable.",
    };
  } catch {
    return {
      ok: false,
      status: "ollama_unreachable",
      message:
        "Local Ollama server not reachable. Start Ollama and confirm the base URL (default http://localhost:11434).",
    };
  }
}

function setupOnlyTestResult(providerId: string): ProviderTestResult {
  const def = getProviderDefinition(providerId);
  return {
    ok: false,
    status: "adapter_not_ready",
    message: `${def.displayName}: provider setup can be saved, but assistant runtime support is coming next.`,
  };
}

export async function testProviderConnection(
  db: Database.Database,
  workspaceId: string,
  options?: {
    apiKey?: string;
    provider?: string;
    model?: string;
    baseUrl?: string;
  },
): Promise<ProviderTestResult> {
  const provider = (options?.provider ?? "openai").trim().toLowerCase();
  const def = getProviderDefinition(provider);
  const model = options?.model?.trim() || def.recommendedModel;

  if (provider === "openai") {
    let apiKey = options?.apiKey?.trim() ?? "";
    if (!apiKey) {
      const config = getProviderConfig(db, workspaceId);
      if (!config?.hasApiKey && def.requiresApiKey) {
        return {
          ok: false,
          status: "invalid_key",
          message: "No API key saved yet. Enter a key to test the connection.",
        };
      }
      const ref = secureStorage.buildRef(workspaceId, provider);
      apiKey = secureStorage.getKey(ref) ?? "";
    }
    if (!apiKey && def.requiresApiKey) {
      return {
        ok: false,
        status: "invalid_key",
        message: "API key could not be loaded from secure storage.",
      };
    }
    return testOpenAIConnection(apiKey, model);
  }

  if (provider === "ollama") {
    const baseUrl =
      options?.baseUrl?.trim() ||
      getProviderBaseUrl(db, workspaceId, provider) ||
      def.defaultBaseUrl ||
      "http://localhost:11434";
    return testOllamaConnection(baseUrl, model);
  }

  if (!isProviderRuntimeReady(provider)) {
    return setupOnlyTestResult(provider);
  }

  return {
    ok: true,
    status: "success",
    message: "Connected successfully.",
  };
}
