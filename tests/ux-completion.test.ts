import { describe, expect, it } from "vitest";

import {

  resolveComposerHint,

  resolveWorkspaceSubtitle,

  shouldShowManualContextPack,

  chatSendAllowed,

} from "../src/shared/startup-flow";

import { resolveSendWhenProviderOffline } from "../src/shared/ux-send-flow";

import {

  loadOnboardingState,

  shouldShowFirstRunWelcome,

} from "../src/shared/onboarding-state";

import type { AppState } from "../src/shared/types";



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



describe("Phase 7 UX completion", () => {

  it("shows first-run welcome when onboarding storage is absent", () => {

    const storage = new MemoryStorage();

    const state = loadOnboardingState(storage, "ws-new");

    expect(shouldShowFirstRunWelcome(state)).toBe(true);

  });



  it("routes offline send to manual save workflow", () => {

    expect(resolveSendWhenProviderOffline(false)).toEqual({

      action: "manual_save",

      openWorkflow: "continue_any_ai",

    });

    expect(resolveSendWhenProviderOffline(true)).toEqual({ action: "stream" });

  });



  it("only shows manual context pack after a manual fallback", () => {

    expect(shouldShowManualContextPack({ providerReady: false, hasManualFallback: false })).toBe(

      false,

    );

    expect(shouldShowManualContextPack({ providerReady: true, hasManualFallback: true })).toBe(

      true,

    );

    expect(shouldShowManualContextPack({ providerReady: true, hasManualFallback: false })).toBe(

      false,

    );

  });



  it("uses calm workspace subtitles per runtime state", () => {

    expect(

      resolveWorkspaceSubtitle({

        providerReady: false,

        providerSetupRequired: false,

        recoveryMode: false,

      }),

    ).toMatch(/save on this device/i);

    expect(

      resolveWorkspaceSubtitle({

        providerReady: true,

        providerSetupRequired: false,

        recoveryMode: false,

      }),

    ).toMatch(/assistant is ready/i);

    expect(

      resolveWorkspaceSubtitle({

        providerReady: false,

        providerSetupRequired: false,

        recoveryMode: true,

      }),

    ).toMatch(/finishing recovery/i);

  });



  it("composer hint stays friendly while local AI starts", () => {

    const hint = resolveComposerHint({

      providerReady: false,

      providerSetupRequired: false,

      lastAutosaveAt: null,

    });

    expect(hint).toMatch(/AI is preparing/i);

  });



  it("allows chat send outside recovery when local AI is offline", () => {

    const state: AppState = {

      recoveryMode: false,

    } as AppState;

    expect(chatSendAllowed(state)).toBe(true);

  });

});


