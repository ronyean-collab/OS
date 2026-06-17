import { useState } from "react";
import { WELCOME_COPY } from "@shared/onboarding-state";
import {
  ASSISTANT_NAMING_COPY,
  ONBOARDING_WIZARD_STEPS,
  wizardStepTitle,
  type OnboardingWizardStep,
} from "@shared/onboarding-wizard";

type Props = {
  step: OnboardingWizardStep;
  assistantName: string;
  onAssistantNameChange: (name: string) => void;
  onAdvance: () => void;
  onBack: () => void;
  onComplete: () => void;
  onDismiss: () => void;
};

export function OnboardingWizard({
  step,
  assistantName,
  onAssistantNameChange,
  onAdvance,
  onBack,
  onComplete,
  onDismiss,
}: Props) {
  return (
    <div
      className="provider-onboarding-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="First-run setup"
      data-testid="onboarding-wizard"
    >
      <div className="provider-onboarding provider-onboarding-wizard">
        <div className="provider-onboarding-card">
          <div className="onboarding-wizard-topbar">
            <p className="eyebrow">{WELCOME_COPY.title}</p>
            <button
              type="button"
              className="secondary small-btn onboarding-dismiss-btn"
              data-testid="onboarding-dismiss"
              onClick={onDismiss}
            >
              Continue later
            </button>
          </div>
          <p className="provider-welcome-tagline">{WELCOME_COPY.tagline}</p>

          <ol className="onboarding-step-progress" aria-label="Setup progress">
            {ONBOARDING_WIZARD_STEPS.map((item) => (
              <li
                key={item.step}
                className={
                  item.step < step ? "done" : item.step === step ? "current" : ""
                }
              >
                {item.label}
              </li>
            ))}
          </ol>

          <h2 className="provider-welcome-question">{wizardStepTitle(step)}</h2>

          {step === 1 && (
            <>
              <p className="muted small">{WELCOME_COPY.subtitle}</p>
              <p className="muted small onboarding-welcome-lead">
                A friendly assistant for meaningful work — calm, helpful, and ready when you are.
              </p>
              <div className="onboarding-wizard-actions">
                <button type="button" className="small-btn" onClick={onAdvance}>
                  Get started
                </button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <p className="muted small">{ASSISTANT_NAMING_COPY.hint}</p>
              <label className="workspace-profile-field">
                <span>Assistant name</span>
                <input
                  type="text"
                  value={assistantName}
                  maxLength={64}
                  placeholder={ASSISTANT_NAMING_COPY.placeholder}
                  data-testid="onboarding-assistant-name"
                  onChange={(e) => onAssistantNameChange(e.target.value)}
                />
              </label>
              <div className="onboarding-wizard-actions">
                <button type="button" className="secondary small-btn" onClick={onBack}>
                  Back
                </button>
                <button
                  type="button"
                  className="secondary small-btn"
                  data-testid="onboarding-assistant-skip"
                  onClick={() => {
                    onAssistantNameChange("Assistant");
                    onComplete();
                  }}
                >
                  {ASSISTANT_NAMING_COPY.skipLabel}
                </button>
                <button type="button" className="small-btn" onClick={onComplete}>
                  Start chatting
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
