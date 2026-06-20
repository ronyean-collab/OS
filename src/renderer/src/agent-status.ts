/**
 * Local Polaris agent activity status contract.
 *
 * This file intentionally contains only local state types and helpers.
 * It does not expose hidden model context or enable remote providers.
 */

export type AgentStatusState =
  | "idle"
  | "working"
  | "ready"
  | "warning"
  | "error";

export type AgentStatus = {
  state: AgentStatusState;
  label: string;
  detail: string | null;
  active: boolean;
};

export type AgentStatusInput = {
  state?: AgentStatusState;
  label?: string | null;
  detail?: string | null;
  active?: boolean;
};

function normalizeText(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

const DEFAULT_LABELS: Record<AgentStatusState, string> = {
  idle: "Idle",
  working: "Working",
  ready: "Ready",
  warning: "Check required",
  error: "Needs attention",
};

export function createAgentStatus(
  input: AgentStatusInput = {},
): AgentStatus {
  const state = input.state ?? "idle";

  return {
    state,
    label: normalizeText(input.label) ?? DEFAULT_LABELS[state],
    detail: normalizeText(input.detail),
    active: input.active ?? state === "working",
  };
}

export function deriveAgentStatus(
  input: AgentStatusInput = {},
): AgentStatus {
  return createAgentStatus(input);
}

export function getAgentStatus(
  input: AgentStatusInput = {},
): AgentStatus {
  return createAgentStatus(input);
}
