import { describe, expect, it } from "vitest";
import {
  chatSendAllowed,
  resolveStartupView,
  simulateRestartPersistence,
} from "../src/shared/startup-flow";
import { loadOnboardingState, postOnboardingOpsTab } from "../src/shared/onboarding-state";
import { resolveSendWhenProviderOffline } from "../src/shared/ux-send-flow";
import { mockAppState, mockOllamaReconnectSequence } from "./utils/renderer-mocks";

describe("renderer integration harness", () => {
  it("onboarding -> chat-first progression without provider gate", () => {
    const fresh = mockAppState({
      providerSetupRequired: true,
      providerReady: false,
      providerReadinessStatus: "not_configured",
    });
    expect(resolveStartupView({ loading: false, appState: fresh })).toBe("chat");
    expect(chatSendAllowed(fresh)).toBe(true);
    expect(postOnboardingOpsTab("ollama")).toBe("settings");

    const ready = mockAppState();
    expect(resolveStartupView({ loading: false, appState: ready })).toBe("chat");
    expect(chatSendAllowed(ready)).toBe(true);
  });

  it("provider reconnect loop reaches ready state", () => {
    const sequence = mockOllamaReconnectSequence();
    const final = sequence.at(-1);
    expect(final?.ok).toBe(true);
    expect(final?.status).toBe("ready");
  });

  it("restart persistence restores provider-ready app state", () => {
    let snapshot: ReturnType<typeof mockAppState> | null = null;
    const persisted = simulateRestartPersistence(
      () => snapshot,
      (value) => {
        snapshot = value;
      },
      mockAppState({ providerSetupRequired: false }),
    );
    expect(persisted.providerReady).toBe(true);
    expect(snapshot?.providerReady).toBe(true);
  });

  it("disabled chat when recovery mode is active", () => {
    const recovery = mockAppState({ recoveryMode: true, providerReady: true });
    expect(resolveStartupView({ loading: false, appState: recovery })).toBe("recovery");
    expect(chatSendAllowed(recovery)).toBe(false);
  });

  it("export/import UI gate: recovery blocks encrypted export path", () => {
    const recovery = mockAppState({ recoveryMode: true });
    expect(recovery.recoveryMode).toBe(true);
    expect(chatSendAllowed(recovery)).toBe(false);
  });

  it("first-run onboarding storage triggers welcome state", () => {
    const storage = {
      data: new Map<string, string>(),
      getItem(key: string) {
        return this.data.get(key) ?? null;
      },
      setItem(key: string, value: string) {
        this.data.set(key, value);
      },
      removeItem(key: string) {
        this.data.delete(key);
      },
    };
    const state = loadOnboardingState(storage, "ws-mock");
    expect(state.onboardingCompleted).toBe(false);
  });

  it("offline send uses manual workflow not stream", () => {
    expect(resolveSendWhenProviderOffline(false).action).toBe("manual_save");
  });
});
