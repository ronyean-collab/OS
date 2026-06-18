import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONSUMER_STATUS_MESSAGE,
  resolveConsumerStatusMessage,
} from "../src/shared/consumer-status-message";
import { resolveComposerHint } from "../src/shared/startup-flow";
import { AI_STATUS_PREPARING } from "../src/shared/ai-readiness";

describe("consumer status message", () => {
  it("returns default when all inputs are missing", () => {
    expect(resolveConsumerStatusMessage({})).toBe(DEFAULT_CONSUMER_STATUS_MESSAGE);
  });

  it("prefers provisioning then app state then embedded", () => {
    expect(
      resolveConsumerStatusMessage({
        provisioningConsumerMessage: "Downloading AI…",
        appState: { defaultAiConsumerMessage: "AI is ready" } as never,
        embedded: { message: "Other" } as never,
      }),
    ).toBe("Downloading AI…");

    expect(
      resolveConsumerStatusMessage({
        appState: { defaultAiConsumerMessage: "From app" } as never,
        embedded: { message: "From embedded" } as never,
      }),
    ).toBe("From app");
  });

  it("composer hint never throws when consumer message is omitted", () => {
    const hint = resolveComposerHint({
      providerReady: false,
      providerSetupRequired: false,
      lastAutosaveAt: null,
      consumerStatusMessage: undefined,
    });
    expect(hint).toBe(AI_STATUS_PREPARING);
  });

  it("composer hint uses resolved consumer message", () => {
    const hint = resolveComposerHint({
      providerReady: false,
      providerSetupRequired: false,
      lastAutosaveAt: null,
      consumerStatusMessage: "Downloading AI… 42%",
    });
    expect(hint).toContain("Downloading");
  });
});
