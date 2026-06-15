import { isOllamaOnlyChatMode } from "./ollama-only-mode";

/** First-run onboarding persistence (renderer localStorage). */

export type OnboardingProviderChoiceId =
  | "openai"
  | "anthropic"
  | "google"
  | "openrouter"
  | "ollama"
  | "later";

export type OnboardingState = {
  onboardingCompleted: boolean;
  preferredProvider: string | null;
  providerConfigured: boolean;
  assistantPreparationCompleted?: boolean;
  manualModeAccepted?: boolean;
  wizardStep?: number;
  selectedChoice?: OnboardingProviderChoiceId | null;
  connectionTestPassed?: boolean;
};

export const ONBOARDING_STORAGE_VERSION = 3;

export const ONBOARDING_PROVIDER_CHOICES: ReadonlyArray<{
  id: OnboardingProviderChoiceId;
  label: string;
  description: string;
  recommended?: boolean;
}> = [
  {
    id: "ollama",
    label: "Ollama (on this computer)",
    description: "Chat inside ContinuityOS with a local AI.",
    recommended: true,
  },
  {
    id: "later",
    label: "Set up later",
    description: "Start chatting manually — connect an AI anytime from Workspace.",
  },
  {
    id: "openai",
    label: "OpenAI",
    description: "Save your preference — connect in Workspace when ready.",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    description: "Save your preference — connect in Workspace when ready.",
  },
  {
    id: "anthropic",
    label: "Claude",
    description: "Save your preference — connect in Workspace when ready.",
  },
  {
    id: "google",
    label: "Gemini",
    description: "Save your preference — connect in Workspace when ready.",
  },
] as const;

export const WELCOME_COPY = {
  title: "Welcome to ContinuityOS",
  tagline: "A calm place to work with an assistant that stays with you.",
  question: "How would you like to start?",
  subtitle: "Name your assistant and start chatting.",
} as const;

export const NO_PROVIDER_BANNER_COPY =
  "You can chat manually anytime. Connect an AI provider from Workspace when you are ready.";

export const CHOOSE_LATER_HINT_COPY =
  "You can connect an AI provider anytime from Workspace → Providers.";

export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export function onboardingStorageKey(workspaceId: string): string {
  return `continuity.onboarding.v${ONBOARDING_STORAGE_VERSION}.${workspaceId}`;
}

export function defaultOnboardingState(): OnboardingState {
  return {
    onboardingCompleted: true,
    preferredProvider: null,
    providerConfigured: false,
  };
}

export function mapChoiceToProviderId(
  choiceId: OnboardingProviderChoiceId,
): string | null {
  if (choiceId === "later") return null;
  if (isOllamaOnlyChatMode() && choiceId !== "ollama") return null;
  return choiceId;
}

/** After onboarding, chat-first — AI providers live in Settings. */
export function postOnboardingOpsTab(
  _choiceId: OnboardingProviderChoiceId,
): "providers" | "backups" | "settings" {
  return "settings";
}

export function loadOnboardingState(
  storage: StorageLike,
  workspaceId: string,
): OnboardingState {
  const raw = storage.getItem(onboardingStorageKey(workspaceId));
  if (!raw) {
    return {
      onboardingCompleted: false,
      preferredProvider: null,
      providerConfigured: false,
    };
  }
  try {
    const parsed = JSON.parse(raw) as Partial<OnboardingState>;
    return {
      onboardingCompleted: Boolean(parsed.onboardingCompleted),
      preferredProvider:
        typeof parsed.preferredProvider === "string"
          ? parsed.preferredProvider
          : parsed.preferredProvider === null
            ? null
            : null,
      providerConfigured: Boolean(parsed.providerConfigured),
      assistantPreparationCompleted: Boolean(parsed.assistantPreparationCompleted),
      manualModeAccepted: Boolean(parsed.manualModeAccepted),
      wizardStep: typeof parsed.wizardStep === "number" ? parsed.wizardStep : undefined,
      selectedChoice:
        typeof parsed.selectedChoice === "string"
          ? (parsed.selectedChoice as OnboardingProviderChoiceId)
          : null,
      connectionTestPassed: Boolean(parsed.connectionTestPassed),
    };
  } catch {
    return {
      onboardingCompleted: false,
      preferredProvider: null,
      providerConfigured: false,
      assistantPreparationCompleted: false,
      manualModeAccepted: false,
    };
  }
}

export function saveOnboardingState(
  storage: StorageLike,
  workspaceId: string,
  state: OnboardingState,
): void {
  storage.setItem(onboardingStorageKey(workspaceId), JSON.stringify(state));
}

export function shouldShowFirstRunWelcome(state: OnboardingState): boolean {
  return !state.onboardingCompleted;
}

export function shouldShowNoProviderBanner(
  state: OnboardingState,
  providerConfigured: boolean,
): boolean {
  return state.onboardingCompleted && !providerConfigured && Boolean(state.preferredProvider);
}

export function completeOnboardingWithProvider(
  storage: StorageLike,
  workspaceId: string,
  providerId: string,
  providerConfigured: boolean,
): OnboardingState {
  const state: OnboardingState = {
    onboardingCompleted: true,
    preferredProvider: providerId,
    providerConfigured,
  };
  saveOnboardingState(storage, workspaceId, state);
  return state;
}

export function completeOnboardingChooseLater(
  storage: StorageLike,
  workspaceId: string,
): OnboardingState {
  const state: OnboardingState = {
    onboardingCompleted: true,
    preferredProvider: null,
    providerConfigured: false,
  };
  saveOnboardingState(storage, workspaceId, state);
  return state;
}

export function saveWizardProgress(
  storage: StorageLike,
  workspaceId: string,
  progress: Pick<
    OnboardingState,
    "wizardStep" | "selectedChoice" | "connectionTestPassed" | "preferredProvider"
  >,
): OnboardingState {
  const current = loadOnboardingState(storage, workspaceId);
  const next: OnboardingState = {
    ...current,
    ...progress,
    onboardingCompleted: current.onboardingCompleted,
  };
  saveOnboardingState(storage, workspaceId, next);
  return next;
}

export function syncProviderConfiguredFlag(
  storage: StorageLike,
  workspaceId: string,
  providerConfigured: boolean,
): OnboardingState {
  const current = loadOnboardingState(storage, workspaceId);
  if (current.providerConfigured === providerConfigured) return current;
  const next = { ...current, providerConfigured };
  saveOnboardingState(storage, workspaceId, next);
  return next;
}

/** Welcome screen must stay minimal — no provider setup fields. */
export function welcomeScreenIsMinimal(): boolean {
  return (
    !WELCOME_COPY.tagline.toLowerCase().includes("api key") &&
    ONBOARDING_PROVIDER_CHOICES.every(
      (c) => !c.label.toLowerCase().includes("billing"),
    )
  );
}

export function markAssistantPreparationCompleted(
  storage: StorageLike,
  workspaceId: string,
  options?: { manualMode?: boolean },
): OnboardingState {
  const current = loadOnboardingState(storage, workspaceId);
  const next: OnboardingState = {
    ...current,
    onboardingCompleted: true,
    assistantPreparationCompleted: true,
    manualModeAccepted: Boolean(options?.manualMode),
    providerConfigured: options?.manualMode ? current.providerConfigured : true,
    preferredProvider: options?.manualMode ? current.preferredProvider : "ollama",
  };
  saveOnboardingState(storage, workspaceId, next);
  return next;
}

export function isAssistantPreparationCompleted(state: OnboardingState): boolean {
  return Boolean(state.assistantPreparationCompleted);
}


