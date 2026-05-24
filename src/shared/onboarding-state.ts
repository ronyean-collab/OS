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
};

export const ONBOARDING_STORAGE_VERSION = 1;

export const ONBOARDING_PROVIDER_CHOICES: ReadonlyArray<{
  id: OnboardingProviderChoiceId;
  label: string;
}> = [
  { id: "openai", label: "OpenAI / ChatGPT" },
  { id: "anthropic", label: "Claude" },
  { id: "google", label: "Gemini" },
  { id: "openrouter", label: "OpenRouter" },
  { id: "ollama", label: "Local Ollama" },
  { id: "later", label: "I'll choose later" },
] as const;

export const WELCOME_COPY = {
  title: "Welcome to ContinuityOS",
  tagline:
    "ContinuityOS keeps your AI work organized, saved, and restore-ready.",
  question: "Which AI provider do you want to use first?",
  subtitle:
    "Choose the AI provider you want to connect first. You can change this anytime.",
} as const;

export const NO_PROVIDER_BANNER_COPY =
  "No AI provider is connected yet. You can still view and manage your workspace.";

export const CHOOSE_LATER_HINT_COPY =
  "You can connect an AI provider anytime from Provider settings.";

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
    onboardingCompleted: false,
    preferredProvider: null,
    providerConfigured: false,
  };
}

export function mapChoiceToProviderId(
  choiceId: OnboardingProviderChoiceId,
): string | null {
  if (choiceId === "later") return null;
  return choiceId;
}

/** After onboarding, provider choices open the Provider tab; choose-later stays on overview. */
export function postOnboardingOpsTab(
  choiceId: OnboardingProviderChoiceId,
): "provider" | "overview" {
  return choiceId === "later" ? "overview" : "provider";
}

export function loadOnboardingState(
  storage: StorageLike,
  workspaceId: string,
): OnboardingState {
  const raw = storage.getItem(onboardingStorageKey(workspaceId));
  if (!raw) return defaultOnboardingState();
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
    };
  } catch {
    return defaultOnboardingState();
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
  return state.onboardingCompleted && !providerConfigured;
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
