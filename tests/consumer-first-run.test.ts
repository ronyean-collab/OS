import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  getConsumerStatus,
  prepareEmbeddedLocalAiOnFirstRun,
} from "../electron/main/services/embedded-local-ai-manager";
import {
  EMBEDDED_AI_CHAT_WHILE_PREPARING,
  EMBEDDED_AI_OFFLINE_MESSAGE,
  EMBEDDED_AI_PREPARING_HEADLINE,
  mapPhaseToConsumerDetail,
} from "../src/shared/embedded-local-ai-consumer";
import { DEFAULT_LOCAL_MODEL, resolveDefaultLocalModel } from "../src/shared/default-ai-config";
import { wizardStepTitle } from "../src/shared/onboarding-wizard";

describe("consumer first-run copy", () => {
  it("uses a single default local model without onboarding picker", () => {
    expect(resolveDefaultLocalModel({})).toBe(DEFAULT_LOCAL_MODEL);
    expect(wizardStepTitle(1)).not.toMatch(/ollama|model|localhost/i);
    expect(wizardStepTitle(2)).not.toMatch(/ollama|model|localhost/i);
  });

  it("maps install phases to consumer language only", () => {
    expect(mapPhaseToConsumerDetail("downloading")).not.toMatch(/ollama|localhost|port/i);
    expect(mapPhaseToConsumerDetail("ready")).toMatch(/ready/i);
    expect(EMBEDDED_AI_PREPARING_HEADLINE).not.toMatch(/ollama/i);
    expect(EMBEDDED_AI_CHAT_WHILE_PREPARING).toMatch(/getting ready/i);
    expect(EMBEDDED_AI_OFFLINE_MESSAGE).toMatch(/internet|connection/i);
  });

  it("ProviderSetupPanel hides technical terms in default view", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/renderer/src/components/ProviderSetupPanel.tsx"),
      "utf8",
    );
    expect(source).toMatch(/Polaris runs locally|built-in local assistant/i);
    expect(source).toContain("provider-advanced-details");
    expect(source).not.toContain("Open Ollama docs");
  });

  it("embedded-local-ai-manager exposes consumer status API", () => {
    expect(typeof prepareEmbeddedLocalAiOnFirstRun).toBe("function");
    expect(typeof getConsumerStatus).toBe("function");
    expect(getConsumerStatus().canChat).toBe(false);
  });
});

