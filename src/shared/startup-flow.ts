import type { AppState } from "./types";

import type { OnboardingState } from "./onboarding-state";

import {
  AI_STATUS_PREPARING,
  AI_STATUS_DOWNLOADING,
} from "./ai-readiness";
import {
  LOCAL_AI_STARTING_DETAIL,
  LOCAL_AI_STARTING_MESSAGE,
} from "./consumer-experience-copy";



export type StartupView =
  | "recovery"
  | "loading"
  | "preparing"
  | "chat";



export type ProviderStatusPresentation = {

  label: string;

  tone: "ready" | "setup" | "warning" | "error";

  composerHint: string;

};



export type RecoveryPresentation = {

  banner: string | null;

  subtleStatus: string | null;

};



export function resolveStartupView(input: {

  appState: AppState | null;

  loading: boolean;

}): StartupView {

  if (input.loading || !input.appState) return "loading";

  if (input.appState.recoveryMode) return "recovery";

  return "chat";

}



/** Chat-first: never auto-open provider setup on launch. */

export function shouldOpenProviderSetupOnLaunch(_appState: AppState | null): boolean {

  return false;

}



/** Composer is always available outside recovery — streaming uses provider readiness separately. */

export function chatSendAllowed(appState: AppState | null): boolean {

  return Boolean(appState && !appState.recoveryMode);

}



export function resolveProviderStatusPresentation(input: {

  providerReady: boolean;

  providerReadinessStatus: AppState["providerReadinessStatus"];

  model: string | null;

  consumerStatusMessage?: string | null;

  provisioningState?: "DOWNLOADING" | "STARTING" | "PREPARING" | "VERIFYING" | null;

}): ProviderStatusPresentation {

  if (input.providerReady && input.model) {

    return {

      label: `Ready · ${input.model}`,

      tone: "ready",

      composerHint: "Your assistant is ready when you are.",

    };

  }

  switch (input.providerReadinessStatus) {

    case "ollama_not_running": {
      const label =
        input.provisioningState === "DOWNLOADING"
          ? AI_STATUS_DOWNLOADING.replace(/…$/, "")
          : input.provisioningState === "STARTING"
            ? "Starting local AI"
            : input.provisioningState === "VERIFYING"
              ? "Verifying AI"
              : "Preparing AI";
      return {
        label,
        tone: "setup",
        composerHint:
          input.consumerStatusMessage?.trim() || AI_STATUS_PREPARING,
      };
    }

    case "model_missing":

      return {

        label: "ContinuityOS AI starting",

        tone: "setup",

        composerHint: LOCAL_AI_STARTING_MESSAGE,

      };

    case "missing_api_key":

    case "invalid_key":

      return {

        label: "Local setup needed",

        tone: "warning",

        composerHint: "Add your local setup in Settings → Polaris Settings.",

      };

    case "network_error":

      return {

        label: "Connection issue",

        tone: "error",

        composerHint: "Check your connection in Settings → Polaris Settings.",

      };

    case "adapter_not_ready":

      return {

        label: "Setup needed",

        tone: "warning",

        composerHint: "Finish provider setup in Settings → Polaris Settings.",

      };

    case "not_configured":

    default:

      return {

        label: "ContinuityOS AI starting",

        tone: "setup",

        composerHint: LOCAL_AI_STARTING_MESSAGE,

      };

  }

}



export function resolveRecoveryPresentation(appState: AppState | null): RecoveryPresentation {

  if (!appState) {

    return { banner: null, subtleStatus: null };

  }

  if (appState.recoveryMode) {

    return {

      banner: appState.recoveryMessage ?? "Continuity is in recovery mode.",

      subtleStatus: null,

    };

  }

  if (appState.previousSessionCrashed) {

    const recovered =

      appState.interruptedResponsesRecovered > 0

        ? `Recovered previous session — ${appState.interruptedResponsesRecovered} interrupted response${

            appState.interruptedResponsesRecovered === 1 ? "" : "s"

          } restored.`

        : "Recovered previous session.";

    return {

      banner: recovered,

      subtleStatus: "Continuity restored",

    };

  }

  if (appState.reliabilityMessage?.trim()) {

    const autosaved = appState.reliabilityMessage.toLowerCase().includes("recovery")

      ? "Recovery successful"

      : "Workspace autosaved";

    return {

      banner: appState.reliabilityMessage,

      subtleStatus: autosaved,

    };

  }

  return { banner: null, subtleStatus: null };

}



export function shouldShowOnboardingWelcome(

  onboarding: OnboardingState,

  _providerReady: boolean,

): boolean {

  return shouldShowFirstRunWelcome(onboarding);

}



function shouldShowFirstRunWelcome(state: OnboardingState): boolean {

  return !state.onboardingCompleted;

}



export function mapSetupActionToOpsTab(

  action: "set_up_local_ai" | "open_provider_setup",

): "settings" {

  void action;

  return "settings";

}



export function simulateRestartPersistence<T>(read: () => T, write: (value: T) => void, value: T): T {

  write(value);

  return read();

}



export function resolveWorkspaceSubtitle(input: {

  providerReady: boolean;

  providerSetupRequired: boolean;

  recoveryMode: boolean;

}): string {

  if (input.recoveryMode) {

    return "Your conversations are safe — we're finishing recovery.";

  }

  if (!input.providerReady) {

    return LOCAL_AI_STARTING_DETAIL;

  }

  return "Your assistant is ready. Pick up where you left off.";

}



export function resolveComposerHint(input: {

  providerReady: boolean;

  providerSetupRequired: boolean;

  lastAutosaveAt: string | null;

  consumerStatusMessage?: string | null;

}): string {

  if (!input.providerReady) {

    return input.consumerStatusMessage?.trim() || AI_STATUS_PREPARING;

  }

  if (input.lastAutosaveAt) {

    return `Saved · ${new Date(input.lastAutosaveAt).toLocaleTimeString()}`;

  }

  return "Ask anything — your conversation stays on this device.";

}



export function shouldShowManualContextPack(input: {

  providerReady: boolean;

  hasManualFallback: boolean;

}): boolean {

  return input.hasManualFallback;

}


