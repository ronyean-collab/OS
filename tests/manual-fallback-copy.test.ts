import { describe, expect, it } from "vitest";
import {
  buildManualFallbackState,
  getManualFallbackMessage,
} from "../src/renderer/src/manual-fallback";

describe("manual fallback copy", () => {
  it("builds no-provider guidance without treating it like an error", () => {
    const fallback = buildManualFallbackState({
      threadId: "thread-12345678",
      sourceMessageId: "message-12345678",
      error: "Ollama is required for AI replies. Install or start Ollama, then select a local model.",
      providerConfigured: false,
    });

    expect(fallback?.kind).toBe("no-provider");
    expect(fallback?.message).toContain("Message saved locally.");
    expect(fallback?.message).toContain("Ollama is required");
    expect(fallback?.message).toContain("Ollama Setup");
  });

  it("builds provider-unavailable guidance when a configured provider fails", () => {
    const fallback = buildManualFallbackState({
      threadId: "thread-12345678",
      sourceMessageId: "message-12345678",
      error: "quota exceeded",
      providerConfigured: true,
    });

    expect(fallback?.kind).toBe("provider-unavailable");
    expect(fallback?.message).toBe(getManualFallbackMessage("provider-unavailable"));
    expect(fallback?.message).toContain("Ollama is unavailable");
  });

  it("does not create fallback guidance for real thread/workspace errors", () => {
    const fallback = buildManualFallbackState({
      threadId: "thread-12345678",
      sourceMessageId: "message-12345678",
      error: "Cannot save message: thread does not belong to the active workspace.",
      providerConfigured: false,
    });

    expect(fallback).toBeNull();
  });
});
