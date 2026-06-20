import { describe, expect, it } from "vitest";
import {
  clearRendererFirstTimeState,
  deriveFirstTimeUserSimulationPath,
  freshOnboardingState,
  listOnboardingStorageKeys,
} from "../src/shared/first-time-user-experience";
import { onboardingStorageKey } from "../src/shared/onboarding-state";
import { resolveComposerHint, resolveProviderStatusPresentation } from "../src/shared/startup-flow";
import { AI_STATUS_PREPARING } from "../src/shared/ai-readiness";

describe("first-time user experience", () => {
  it("fresh onboarding state requires wizard and preparation", () => {
    const state = freshOnboardingState();
    expect(state.onboardingCompleted).toBe(false);
    expect(state.assistantPreparationCompleted).toBe(false);
  });

  it("clears renderer keys and writes fresh onboarding", () => {
    const storage = new Map<string, string>();
    const adapter = {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => {
        storage.set(k, v);
      },
      removeItem: (k: string) => {
        storage.delete(k);
      },
      length: 0,
      key: () => null,
    };
    const ws = "ws-test";
    adapter.setItem(onboardingStorageKey(ws), JSON.stringify({ onboardingCompleted: true }));
    const { keysCleared } = clearRendererFirstTimeState(adapter, [ws]);
    expect(keysCleared.length).toBeGreaterThanOrEqual(0);
    const loaded = JSON.parse(adapter.getItem(onboardingStorageKey(ws)) ?? "{}");
    expect(loaded.onboardingCompleted).toBe(false);
  });

  it("lists onboarding storage keys per workspace", () => {
    const keys = listOnboardingStorageKeys(
      {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
      },
      ["a", "b"],
    );
    expect(keys).toContain(onboardingStorageKey("a"));
    expect(keys).toContain(onboardingStorageKey("b"));
  });

  it("simulation path starts at onboarding for fresh user", () => {
    const path = deriveFirstTimeUserSimulationPath({
      loading: false,
      recoveryMode: false,
      onboarding: freshOnboardingState(),
      preparation: null,
      showPreparationScreen: false,
      threadCount: 0,
    });
    expect(path.currentStep).toBe("onboarding");
    expect(path.steps.find((s) => s.id === "onboarding")?.active).toBe(true);
  });

  it("composer hint uses real preparation message not generic starting text", () => {
    const hint = resolveComposerHint({
      providerReady: false,
      providerSetupRequired: false,
      lastAutosaveAt: null,
      consumerStatusMessage: "Downloading AI… 42%",
    });
    expect(hint).toContain("Downloading");
    expect(hint).not.toMatch(/AI is starting/i);

    const fallback = resolveComposerHint({
      providerReady: false,
      providerSetupRequired: false,
      lastAutosaveAt: null,
    });
    expect(fallback).toBe(AI_STATUS_PREPARING);
  });

  it("provider badge uses preparation labels", () => {
    const view = resolveProviderStatusPresentation({
      providerReady: false,
      providerReadinessStatus: "ollama_not_running",
      model: null,
      consumerStatusMessage: "Downloading AI…",
      provisioningState: "DOWNLOADING",
    });
    expect(view.label).toMatch(/Downloading/i);
    expect(view.composerHint).toContain("Downloading");
  });
});
