export type ManualFallbackKind = "no-provider" | "provider-unavailable";

export type ManualFallbackState = {
  threadId: string;
  sourceMessageId: string;
  kind: ManualFallbackKind;
  message: string;
};

const THREAD_OR_WORKSPACE_ERROR_RE = /thread|workspace/i;
const NO_PROVIDER_ERROR_RE =
  /no chat provider|select a local ollama model|ollama is required|in-app chat uses ollama only|not fully configured|open providers/i;

export function getManualFallbackMessage(kind: ManualFallbackKind): string {
  if (kind === "provider-unavailable") {
    return "Message saved locally. ContinuityOS AI is unavailable right now — try again shortly or check Settings.";
  }
  return "Message saved locally. ContinuityOS AI is still starting — you can continue setup later in Settings.";
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
