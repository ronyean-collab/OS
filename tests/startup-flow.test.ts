import { describe, expect, it } from "vitest";

import {

  chatSendAllowed,

  resolveProviderStatusPresentation,

  resolveRecoveryPresentation,

  resolveWorkspaceSubtitle,

  resolveStartupView,

  shouldShowManualContextPack,

  shouldOpenProviderSetupOnLaunch,

  simulateRestartPersistence,

  mapSetupActionToOpsTab,

} from "../src/shared/startup-flow";

import type { AppState } from "../src/shared/types";



function baseAppState(overrides: Partial<AppState> = {}): AppState {

  return {

    recoveryMode: false,

    recoveryMessage: null,

    activeWorkspaceId: "ws-1",

    activeThreadId: "th-1",

    dbReady: true,

    continuityHealthy: true,

    lastSnapshotAt: null,

    lastSuccessfulPersistenceAt: null,

    version: "0.1.0",

    appliedMigrationVersion: 12,

    migrationsJustApplied: [],

    previousSessionCrashed: false,

    downgradeDetected: false,

    startupWarnings: [],

    interruptedResponsesRecovered: 0,

    sqliteRepairAttempted: false,

    sqliteIntegrityRestored: false,

    reliabilityMessage: null,

    providerSetupRequired: false,

    providerReady: true,

    selectedProvider: "ollama",

    providerReadinessStatus: "ready",

    runtimeHealthScore: 0.8,

    recoveryConfidenceScore: 0.75,

    ...overrides,

  };

}



describe("startup flow", () => {

  it("resolves loading, recovery, and chat views", () => {

    expect(resolveStartupView({ loading: true, appState: null })).toBe("loading");

    expect(

      resolveStartupView({

        loading: false,

        appState: baseAppState({ recoveryMode: true }),

      }),

    ).toBe("recovery");

    expect(

      resolveStartupView({

        loading: false,

        appState: baseAppState({ providerSetupRequired: true, providerReady: false }),

      }),

    ).toBe("chat");

    expect(

      resolveStartupView({

        loading: false,

        appState: baseAppState(),

      }),

    ).toBe("chat");

  });



  it("allows chat composer outside recovery even when provider is offline", () => {

    expect(chatSendAllowed(baseAppState())).toBe(true);

    expect(chatSendAllowed(baseAppState({ providerReady: false }))).toBe(true);

    expect(chatSendAllowed(baseAppState({ recoveryMode: true }))).toBe(false);

  });



  it("never auto-opens provider setup on launch", () => {

    expect(shouldOpenProviderSetupOnLaunch(baseAppState({ providerSetupRequired: true }))).toBe(

      false,

    );

    expect(shouldOpenProviderSetupOnLaunch(baseAppState({ recoveryMode: true }))).toBe(false);

  });



  it("presents calm recovery copy after crash", () => {

    const presentation = resolveRecoveryPresentation(

      baseAppState({

        previousSessionCrashed: true,

        interruptedResponsesRecovered: 2,

      }),

    );

    expect(presentation.banner).toContain("2 interrupted");

    expect(presentation.subtleStatus).toBe("Continuity restored");

  });



  it("maps provider readiness to consumer-facing labels", () => {

    expect(

      resolveProviderStatusPresentation({

        providerReady: true,

        providerReadinessStatus: "ready",

        model: "llama3.1:latest",

      }).tone,

    ).toBe("ready");

    expect(

      resolveProviderStatusPresentation({

        providerReady: false,

        providerReadinessStatus: "ollama_not_running",

        model: null,

      }).label,

    ).toMatch(/Preparing AI/i);

  });



  it("simulates restart persistence round-trip", () => {

    let stored = 0;

    const value = simulateRestartPersistence(

      () => stored,

      (next) => {

        stored = next;

      },

      42,

    );

    expect(value).toBe(42);

    expect(stored).toBe(42);

  });



  it("maps setup actions to settings tab", () => {

    expect(mapSetupActionToOpsTab("set_up_local_ai")).toBe("settings");

    expect(mapSetupActionToOpsTab("open_provider_setup")).toBe("settings");

  });



  it("exposes workspace subtitle and manual panel helpers", () => {

    expect(

      resolveWorkspaceSubtitle({

        providerReady: true,

        providerSetupRequired: false,

        recoveryMode: false,

      }),

    ).toContain("assistant is ready");

    expect(shouldShowManualContextPack({ providerReady: false, hasManualFallback: false })).toBe(

      false,

    );

    expect(shouldShowManualContextPack({ providerReady: false, hasManualFallback: true })).toBe(

      true,

    );

  });

});


