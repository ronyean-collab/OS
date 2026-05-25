import { describe, expect, it, beforeEach } from "vitest";
import {
  completeOnboardingChooseLater,
  completeOnboardingWithProvider,
  defaultOnboardingState,
  loadOnboardingState,
  mapChoiceToProviderId,
  postOnboardingOpsTab,
  onboardingStorageKey,
  ONBOARDING_PROVIDER_CHOICES,
  shouldShowFirstRunWelcome,
  shouldShowNoProviderBanner,
  WELCOME_COPY,
  welcomeScreenIsMinimal,
} from "../src/shared/onboarding-state";
import { getProviderDefinition } from "../src/shared/provider-definitions";

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
}

describe("onboarding flow state", () => {
  let storage: MemoryStorage;
  const wsId = "ws-onboard-1";

  beforeEach(() => {
    storage = new MemoryStorage();
  });

  it("manual-first default state does not block app use", () => {
    const state = defaultOnboardingState();
    expect(state.onboardingCompleted).toBe(true);
    expect(shouldShowFirstRunWelcome(state)).toBe(false);
    expect(shouldShowNoProviderBanner(state, false)).toBe(false);
  });

  it("selecting OpenAI saves preferred provider and opens Provider tab", () => {
    const state = completeOnboardingWithProvider(storage, wsId, "openai", false);
    expect(state.onboardingCompleted).toBe(true);
    expect(state.preferredProvider).toBe("openai");
    expect(shouldShowFirstRunWelcome(state)).toBe(false);
    expect(postOnboardingOpsTab("openai")).toBe("provider");
    const reloaded = loadOnboardingState(storage, wsId);
    expect(reloaded.preferredProvider).toBe("openai");
    expect(storage.getItem(onboardingStorageKey(wsId))).toContain("openai");
  });

  it("selecting Claude maps to anthropic and opens Provider tab", () => {
    const id = mapChoiceToProviderId("anthropic");
    expect(id).toBe("anthropic");
    expect(postOnboardingOpsTab("anthropic")).toBe("provider");
    const state = completeOnboardingWithProvider(storage, wsId, id!, false);
    expect(state.preferredProvider).toBe("anthropic");
  });

  it("choose later enters app without provider and without a blocking banner", () => {
    const state = completeOnboardingChooseLater(storage, wsId);
    expect(state.onboardingCompleted).toBe(true);
    expect(state.preferredProvider).toBeNull();
    expect(state.providerConfigured).toBe(false);
    expect(shouldShowNoProviderBanner(state, false)).toBe(false);
  });

  it("preferred provider persists after restart simulation", () => {
    completeOnboardingWithProvider(storage, wsId, "google", false);
    const storage2 = new MemoryStorage();
    const raw = storage.getItem(onboardingStorageKey(wsId));
    storage2.setItem(onboardingStorageKey(wsId), raw!);
    expect(loadOnboardingState(storage2, wsId).preferredProvider).toBe("google");
  });

  it("welcome screen stays minimal without setup clutter", () => {
    expect(welcomeScreenIsMinimal()).toBe(true);
    expect(WELCOME_COPY.tagline).not.toMatch(/api key/i);
    expect(WELCOME_COPY.subtitle).toMatch(/optional/i);
    expect(ONBOARDING_PROVIDER_CHOICES.map((c) => c.label).join(" ")).not.toMatch(
      /billing|setup step/i,
    );
  });

  it("provider setup instructions live in provider definitions not welcome", () => {
    const openaiSteps = getProviderDefinition("openai").setupSteps.length;
    const claudeSteps = getProviderDefinition("anthropic").setupSteps.length;
    expect(openaiSteps).toBeGreaterThan(0);
    expect(claudeSteps).toBeGreaterThan(0);
    expect(WELCOME_COPY.question.length).toBeLessThan(80);
  });

  it("changing provider updates distinct setup instructions", () => {
    const openai = getProviderDefinition("openai").setupSteps.join("|");
    const claude = getProviderDefinition("anthropic").setupSteps.join("|");
    expect(openai).not.toBe(claude);
  });
});
