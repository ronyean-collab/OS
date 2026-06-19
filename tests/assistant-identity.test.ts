import { describe, expect, it } from "vitest";
import {
  ASSISTANT_IDENTITY_PROMPT_VERSION,
  buildAssistantIdentityPrompt,
  buildAssistantIdentityPromptForProfile,
} from "../electron/main/services/assistant-identity-service";
import { normalizeProviderContext } from "../electron/main/services/provider-continuity";
import { assembleProviderContext } from "../electron/main/services/context-assembly";
import type { Message } from "../src/shared/types";

describe("assistant identity service", () => {
  it("buildAssistantIdentityPrompt includes core principles", () => {
    const prompt = buildAssistantIdentityPrompt({
      assistantName: "Ada",
      providerId: "ollama",
      modelName: "llama3.1",
      webEnabled: true,
      memoryEnabled: true,
      continuityEnabled: true,
    });

    expect(prompt).toContain("ContinuityOS assistant");
    expect(prompt).toContain("conversation history");
    expect(prompt).toContain("source of truth");
    expect(prompt).toContain("Derived summaries");
    expect(prompt.toLowerCase()).toContain("do not infer hidden personal traits");
    expect(prompt.toLowerCase()).toContain("psychological profiles");
    expect(prompt).toContain("never become a provider-branded persona");
    expect(prompt).toContain("If you do not know, say so");
    expect(prompt).toContain("never hallucinate certainty");
    expect(prompt).toContain("vectors, embeddings, compression, retrieval");
    expect(prompt).toContain("Do not say you remembered");
    expect(ASSISTANT_IDENTITY_PROMPT_VERSION).toBe(1);
  });

  it("defaults assistant name to Assistant", () => {
    const prompt = buildAssistantIdentityPrompt({});
    expect(prompt).toContain("User-chosen name for ownership: Assistant");
  });

  it("does not instruct constant self-naming", () => {
    const prompt = buildAssistantIdentityPrompt({ assistantName: "Nova" });
    expect(prompt).toContain("Do not roleplay this name");
    expect(prompt).toContain("Only if directly asked who you are");
  });

  it("reflects web disabled policy", () => {
    const prompt = buildAssistantIdentityPrompt({ webEnabled: false });
    expect(prompt).toContain("Web access is off");
  });

  it("buildAssistantIdentityPromptForProfile uses profile flags", () => {
    const prompt = buildAssistantIdentityPromptForProfile(
      {
        assistantName: "Helper",
        assistantCreatedAt: "2026-01-01T00:00:00.000Z",
        assistantIdentityVersion: 1,
        preferredTone: "friendly",
        webEnabled: true,
        memoryEnabled: true,
        continuityEnabled: true,
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      { providerId: "openai", modelName: "gpt-4o-mini" },
    );
    expect(prompt).toContain("Engine: openai (gpt-4o-mini)");
    expect(prompt).toContain("Helper");
  });

  it("provider switch preserves same identity instructions", () => {
    const base = buildAssistantIdentityPrompt({
      assistantName: "Assistant",
      providerId: "ollama",
    });
    const switched = buildAssistantIdentityPrompt({
      assistantName: "Assistant",
      providerId: "openai",
      modelName: "gpt-4o-mini",
    });
    expect(base.split("Engine:")[0]).toBe(switched.split("Engine:")[0]);
  });

  it("identity prompt is first in Ollama provider context", () => {
    const identity = buildAssistantIdentityPrompt({ providerId: "ollama" });
    const { messages } = assembleProviderContext({
      workspaceName: "Demo",
      assistantIdentityPrompt: identity,
      continuitySummary: "Project notes",
      messages: [
        {
          id: "1",
          threadId: "t",
          role: "user",
          content: "Hello",
          provider: null,
          model: null,
          rawProviderPayload: null,
          createdAt: "2026-01-01T00:00:00.000Z",
        } as Message,
      ],
    });
    expect(messages[0].role).toBe("system");
    expect(messages[0].content.startsWith("You are the user's ContinuityOS assistant")).toBe(true);
    expect(messages[0].content).toContain("Project: Demo");
    const normalized = normalizeProviderContext("ollama", messages);
    expect(normalized[0].content).toContain("ContinuityOS assistant");
  });

  it("identity prompt is included in OpenAI provider context", () => {
    const identity = buildAssistantIdentityPrompt({ providerId: "openai" });
    const { messages } = assembleProviderContext({
      workspaceName: "Demo",
      assistantIdentityPrompt: identity,
      messages: [],
    });
    const normalized = normalizeProviderContext("openai", messages);
    expect(normalized[0].role).toBe("system");
    expect(normalized[0].content).toContain("Raw conversation history in this thread is the source of truth");
  });

  it("setup-only provider ids still produce safe identity context", () => {
    const identity = buildAssistantIdentityPrompt({ providerId: "anthropic" });
    expect(() =>
      assembleProviderContext({
        workspaceName: "Demo",
        assistantIdentityPrompt: identity,
        messages: [],
      }),
    ).not.toThrow();
    const normalized = normalizeProviderContext("anthropic", [
      { role: "system", content: identity },
    ]);
    expect(normalized[0].content).toContain("ContinuityOS assistant");
  });
});
