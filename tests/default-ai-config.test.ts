import { describe, expect, it, afterEach, beforeEach } from "vitest";
import {
  DEFAULT_AI_ENV_KEYS,
  loadDefaultHostedAiConfig,
} from "../src/shared/default-ai-config";

describe("default hosted AI config", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env[DEFAULT_AI_ENV_KEYS.provider];
    delete process.env[DEFAULT_AI_ENV_KEYS.model];
    delete process.env[DEFAULT_AI_ENV_KEYS.baseUrl];
    delete process.env[DEFAULT_AI_ENV_KEYS.keyRef];
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns null when hosted fallback env is incomplete", () => {
    process.env[DEFAULT_AI_ENV_KEYS.provider] = "openai";
    expect(loadDefaultHostedAiConfig()).toBeNull();
  });

  it("loads hosted fallback from env without secrets", () => {
    process.env[DEFAULT_AI_ENV_KEYS.provider] = "openai";
    process.env[DEFAULT_AI_ENV_KEYS.model] = "gpt-4o-mini";
    process.env[DEFAULT_AI_ENV_KEYS.keyRef] = "continuity-default-hosted";
    process.env[DEFAULT_AI_ENV_KEYS.baseUrl] = "https://api.openai.com/v1";

    expect(loadDefaultHostedAiConfig()).toEqual({
      provider: "openai",
      model: "gpt-4o-mini",
      baseUrl: "https://api.openai.com/v1",
      keyRef: "continuity-default-hosted",
    });
  });
});
