/**
 * Canonical user-facing status for the local Ollama runtime.
 *
 * This module contains local status labels only. It does not perform
 * network requests, store credentials, or enable cloud providers.
 */

export type OllamaCanonicalStage =
  | "checking"
  | "not_installed"
  | "starting"
  | "downloading"
  | "offline"
  | "error"
  | "ready";

export type OllamaCanonicalStatus = {
  stage: OllamaCanonicalStage;
  ready: boolean;
  canReply: boolean;
  message: string;
  detail: string | null;
};

export const OLLAMA_USER_MESSAGES = {
  checking: "Checking local AI readiness…",
  not_installed: "Local AI needs to be installed.",
  starting: "Starting your local AI…",
  downloading: "Preparing your local AI model…",
  offline: "Local AI is currently unavailable.",
  error: "Local AI needs attention.",
  ready: "Your Ollama-powered assistant is ready.",
} as const;

export type OllamaCanonicalStatusInput = {
  stage?: OllamaCanonicalStage;
  ready?: boolean;
  canReply?: boolean;
  detail?: string | null;
  message?: string | null;
};

function normalizeText(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function createOllamaCanonicalStatus(
  input: OllamaCanonicalStatusInput = {},
): OllamaCanonicalStatus {
  const stage: OllamaCanonicalStage =
    input.stage ?? (input.ready ? "ready" : "checking");

  const ready = input.ready ?? stage === "ready";
  const canReply = input.canReply ?? ready;

  return {
    stage,
    ready,
    canReply,
    message:
      normalizeText(input.message) ??
      OLLAMA_USER_MESSAGES[stage],
    detail: normalizeText(input.detail),
  };
}

export function deriveOllamaCanonicalStatus(
  input: OllamaCanonicalStatusInput = {},
): OllamaCanonicalStatus {
  return createOllamaCanonicalStatus(input);
}

export function getOllamaCanonicalStatus(
  input: OllamaCanonicalStatusInput = {},
): OllamaCanonicalStatus {
  return createOllamaCanonicalStatus(input);
}
