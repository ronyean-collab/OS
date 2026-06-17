export type OnboardingWizardStep = 1 | 2;

export const ONBOARDING_WIZARD_STEPS: ReadonlyArray<{
  step: OnboardingWizardStep;
  label: string;
}> = [
  { step: 1, label: "Welcome" },
  { step: 2, label: "Name assistant" },
] as const;

export type OnboardingWizardProgress = {
  wizardStep: OnboardingWizardStep;
  connectionTestPassed: boolean;
};

export function nextWizardStep(current: OnboardingWizardStep): OnboardingWizardStep {
  if (current === 1) return 2;
  return 2;
}

export function previousWizardStep(current: OnboardingWizardStep): OnboardingWizardStep {
  if (current <= 1) return 1;
  return 1;
}

export function wizardStepTitle(step: OnboardingWizardStep): string {
  switch (step) {
    case 1:
      return "Welcome to ContinuityOS";
    case 2:
      return "Name your assistant";
    default:
      return "Welcome";
  }
}

export function continuityReadyMessage(): string {
  return "Your assistant is ready. Start a conversation whenever you like.";
}

export const ASSISTANT_NAMING_COPY = {
  hint: "What should your assistant be called? You can change this anytime.",
  placeholder: "Assistant",
  skipLabel: "Use default name",
} as const;
