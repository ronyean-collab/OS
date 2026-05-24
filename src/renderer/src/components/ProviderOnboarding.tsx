import {
  ONBOARDING_PROVIDER_CHOICES,
  WELCOME_COPY,
  type OnboardingProviderChoiceId,
} from "@shared/onboarding-state";

type Props = {
  onSelectProvider: (choiceId: OnboardingProviderChoiceId) => void;
};

export function ProviderOnboarding({ onSelectProvider }: Props) {
  return (
    <div
      className="provider-onboarding provider-onboarding-minimal"
      role="region"
      aria-label="Welcome"
      data-testid="provider-onboarding-welcome"
    >
      <div className="provider-onboarding-card">
        <p className="eyebrow">{WELCOME_COPY.title}</p>
        <p className="provider-welcome-tagline">{WELCOME_COPY.tagline}</p>
        <p className="provider-welcome-subtitle muted">{WELCOME_COPY.subtitle}</p>
        <h2 className="provider-welcome-question">{WELCOME_COPY.question}</h2>

        <ul className="provider-choice-list" role="list">
          {ONBOARDING_PROVIDER_CHOICES.map((choice) => (
            <li key={choice.id}>
              <button
                type="button"
                className="provider-choice-btn"
                data-choice={choice.id}
                onClick={() => onSelectProvider(choice.id)}
              >
                {choice.label}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
