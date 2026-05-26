import { describe, expect, it } from "vitest";
import {
  getActiveChatProviderDefinitions,
  getProviderDefinition,
  listProviderDefinitions,
  listVisibleProviderDefinitions,
  providerStatusLabel,
} from "../src/shared/provider-definitions";
import { isProviderRuntimeReady } from "../electron/main/services/provider-runtime";

describe("provider definitions", () => {
  it("lists all supported providers", () => {
    const ids = listProviderDefinitions().map((p) => p.id);
    expect(ids).toEqual(["openai", "anthropic", "google", "openrouter", "ollama"]);
  });

  it("shows only ollama in the normal UI and active chat engine list", () => {
    expect(listVisibleProviderDefinitions().map((p) => p.id)).toEqual(["ollama"]);
    expect(getActiveChatProviderDefinitions().map((p) => p.id)).toEqual(["ollama"]);
  });

  it("openai is ready with api key url", () => {
    const openai = getProviderDefinition("openai");
    expect(openai.status).toBe("ready");
    expect(openai.recommendedModel).toBe("gpt-4.1-mini");
    expect(openai.apiKeyUrl).toContain("openai.com");
  });

  it("ollama does not require api key", () => {
    const ollama = getProviderDefinition("ollama");
    expect(ollama.requiresApiKey).toBe(false);
    expect(ollama.localOnly).toBe(true);
    expect(ollama.defaultBaseUrl).toBe("http://localhost:11434");
  });

  it("anthropic is setup_only", () => {
    expect(getProviderDefinition("anthropic").status).toBe("setup_only");
    expect(providerStatusLabel("setup_only")).toMatch(/runtime coming next/i);
  });

  it("runtime ready only for ollama in the normal chat flow", () => {
    expect(isProviderRuntimeReady("openai")).toBe(false);
    expect(isProviderRuntimeReady("anthropic")).toBe(false);
    expect(isProviderRuntimeReady("ollama")).toBe(true);
  });

  it("setup instructions differ by provider", () => {
    const openai = getProviderDefinition("openai").setupSteps.join(" ");
    const anthropic = getProviderDefinition("anthropic").setupSteps.join(" ");
    const ollama = getProviderDefinition("ollama").setupSteps.join(" ");
    expect(openai).not.toBe(anthropic);
    expect(ollama.toLowerCase()).toMatch(/ollama|local/);
  });
});
