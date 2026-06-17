/** First-time user experience — reset, simulation paths, renderer state clearing. */

import {
  ONBOARDING_STORAGE_VERSION,
  onboardingStorageKey,
  shouldShowFirstRunWelcome,
  type OnboardingState,
} from "./onboarding-state";
import {
  shouldShowAssistantPreparationScreen,
  type AssistantPreparationStatus,
} from "./assistant-preparation-service";

export type FirstTimeSimulationStep =
  | "loading"
  | "onboarding"
  | "preparation"
  | "first_chat"
  | "chat";

export type FirstTimeUserSimulationPath = {
  currentStep: FirstTimeSimulationStep;
  steps: ReadonlyArray<{
    id: FirstTimeSimulationStep;
    label: string;
    active: boolean;
    complete: boolean;
  }>;
  summary: string;
};

export type ExperienceResetResult = {
  ok: boolean;
  workspaceId: string;
  threadsRemoved: number;
  messagesRemoved: number;
  snapshotsPreserved: number;
  message: string;
};

export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  length?: number;
  key?(index: number): string | null;
};

const RENDERER_TEST_KEY_PREFIXES = [
  "continuity.onboarding.",
  "continuity.transfer.",
  "continuity.guidance.",
  "continuity.local-test.",
  "continuity.first-time-simulation.",
] as const;

export function freshOnboardingState(): OnboardingState {
  return {
    onboardingCompleted: false,
    preferredProvider: null,
    providerConfigured: false,
    assistantPreparationCompleted: false,
    manualModeAccepted: false,
    wizardStep: 1,
    selectedChoice: null,
    connectionTestPassed: false,
  };
}

export function listOnboardingStorageKeys(
  storage: StorageLike,
  workspaceIds: string[],
): string[] {
  const keys = new Set<string>();
  for (const workspaceId of workspaceIds) {
    keys.add(onboardingStorageKey(workspaceId));
  }
  if (typeof storage.length === "number" && typeof storage.key === "function") {
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (!key) continue;
      if (RENDERER_TEST_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))) {
        keys.add(key);
      }
    }
  }
  return [...keys];
}

export function clearRendererFirstTimeState(
  storage: StorageLike,
  workspaceIds: string[],
): { keysCleared: string[] } {
  const keys = listOnboardingStorageKeys(storage, workspaceIds);
  for (const key of keys) {
    storage.removeItem(key);
  }
  for (const workspaceId of workspaceIds) {
    storage.setItem(
      onboardingStorageKey(workspaceId),
      JSON.stringify(freshOnboardingState()),
    );
  }
  return { keysCleared: keys };
}

export function deriveFirstTimeUserSimulationPath(input: {
  loading: boolean;
  recoveryMode: boolean;
  onboarding: OnboardingState | null;
  preparation: AssistantPreparationStatus | null;
  showPreparationScreen: boolean;
  threadCount: number;
}): FirstTimeUserSimulationPath {
  const steps: FirstTimeUserSimulationPath["steps"] = [
    { id: "onboarding", label: "Onboarding", active: false, complete: false },
    { id: "preparation", label: "Assistant preparation", active: false, complete: false },
    { id: "first_chat", label: "First chat", active: false, complete: false },
    { id: "chat", label: "Daily chat", active: false, complete: false },
  ];

  if (input.loading) {
    return {
      currentStep: "loading",
      steps,
      summary: "App is loading workspace and runtime state.",
    };
  }

  if (input.recoveryMode) {
    return {
      currentStep: "loading",
      steps,
      summary: "Recovery mode — first-time simulation paused until recovery completes.",
    };
  }

  const onboarding = input.onboarding;
  const onboardingNeeded =
    onboarding != null && shouldShowFirstRunWelcome(onboarding);
  const preparationNeeded =
    input.showPreparationScreen ||
    (onboarding != null &&
      shouldShowAssistantPreparationScreen({
        recoveryMode: false,
        assistantPreparationCompleted: Boolean(onboarding.assistantPreparationCompleted),
        canReply: false,
        manualModeAccepted: Boolean(onboarding.manualModeAccepted),
      }));

  if (onboardingNeeded) {
    const next = steps.map((s) => ({
      ...s,
      active: s.id === "onboarding",
      complete: false,
    }));
    return {
      currentStep: "onboarding",
      steps: next,
      summary: "User sees onboarding wizard — name assistant and choose how to start.",
    };
  }

  if (preparationNeeded) {
    const stage = input.preparation?.stageLabel ?? input.preparation?.stage ?? "preparing";
    const next = steps.map((s) => ({
      ...s,
      active: s.id === "preparation",
      complete: s.id === "onboarding",
    }));
    return {
      currentStep: "preparation",
      steps: next,
      summary: `User sees preparation screen (${stage}).`,
    };
  }

  if (input.threadCount === 0) {
    const next = steps.map((s) => ({
      ...s,
      active: s.id === "first_chat",
      complete: s.id === "onboarding" || s.id === "preparation",
    }));
    return {
      currentStep: "first_chat",
      steps: next,
      summary: "Empty thread list — first conversation will be created on send.",
    };
  }

  const next = steps.map((s) => ({
    ...s,
    active: s.id === "chat",
    complete: s.id !== "chat",
  }));
  return {
    currentStep: "chat",
    steps: next,
    summary: "Conversation-first chat — messages and composer are primary.",
  };
}

export const FIRST_TIME_RESET_DEV_ONLY = true;

export const ONBOARDING_KEY_PATTERN = `continuity.onboarding.v${ONBOARDING_STORAGE_VERSION}.`;
