export type ManualFallbackKind = "no-provider" | "provider-unavailable";

export type ManualFallbackState = {
  threadId: string;
  sourceMessageId: string;
  kind: ManualFallbackKind;
  message: string;
};

const THREAD_OR_WORKSPACE_ERROR_RE = /thread|workspace/i;
const NO_PROVIDER_ERROR_RE =
  /choose an ai provider|provider settings|not fully configured|setup|base url/i;

export function getManualFallbackMessage(kind: ManualFallbackKind): string {
  if (kind === "provider-unavailable") {
    return "Message saved locally. Provider unavailable, but you can still continue in any AI with a Context Pack.";
  }
  return "Message saved locally. No AI provider is connected, so ContinuityOS will help you continue this in any AI. Copy the Context Pack, paste it into ChatGPT, Claude, Gemini, or another AI, then paste the reply back here.";
}

export function buildManualFallbackState(input: {
  threadId: string;
  sourceMessageId: string | null;
  error?: string;
  providerConfigured: boolean;
}): ManualFallbackState | null {
  const sourceMessageId = input.sourceMessageId?.trim() ?? "";
  if (!input.threadId.trim() || !sourceMessageId) {
    return null;
  }

  const error = input.error?.trim();
  if (error && THREAD_OR_WORKSPACE_ERROR_RE.test(error)) {
    return null;
  }

  const kind: ManualFallbackKind =
    !input.providerConfigured || (error != null && NO_PROVIDER_ERROR_RE.test(error))
      ? "no-provider"
      : "provider-unavailable";

  return {
    threadId: input.threadId,
    sourceMessageId,
    kind,
    message: getManualFallbackMessage(kind),
  };
}
