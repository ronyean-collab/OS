import type { ProviderMessage } from "../providers/types";

export type ProviderCapabilityMetadata = {
  provider: string;
  local: boolean;
  enabled: boolean;
  supportsSystemMessages: boolean;
  supportsStreaming: boolean;
  supportsTools: boolean;
  contextPortability: number;
};

const LOCAL_CAPABILITIES: Record<string, ProviderCapabilityMetadata> = {
  ollama: {
    provider: "ollama",
    local: true,
    enabled: true,
    supportsSystemMessages: true,
    supportsStreaming: true,
    supportsTools: false,
    contextPortability: 1,
  },
  manual: {
    provider: "manual",
    local: true,
    enabled: true,
    supportsSystemMessages: true,
    supportsStreaming: false,
    supportsTools: false,
    contextPortability: 1,
  },
};

const DISABLED_COMPATIBILITY_CAPABILITY: Omit<
  ProviderCapabilityMetadata,
  "provider"
> = {
  local: false,
  enabled: false,
  supportsSystemMessages: true,
  supportsStreaming: false,
  supportsTools: false,
  contextPortability: 0.5,
};

function normalizeProviderId(provider: string | null | undefined): string {
  return provider?.trim().toLowerCase() || "ollama";
}

export function getProviderCapabilityMetadata(
  provider: string,
): ProviderCapabilityMetadata {
  const normalized = normalizeProviderId(provider);

  return (
    LOCAL_CAPABILITIES[normalized] ?? {
      provider: normalized,
      ...DISABLED_COMPATIBILITY_CAPABILITY,
    }
  );
}

export function scoreProviderContinuityPortability(
  fromProvider: string,
  toProvider: string,
): number {
  const from = getProviderCapabilityMetadata(fromProvider);
  const to = getProviderCapabilityMetadata(toProvider);

  if (from.provider === to.provider) {
    return 1;
  }

  if (from.local && to.local) {
    return 1;
  }

  return Math.min(from.contextPortability, to.contextPortability);
}

function normalizeMessageContent(content: string): string {
  return content.replace(/\r\n/g, "\n").trim();
}

export function normalizeProviderContext(
  provider: string,
  messages: ProviderMessage[],
): ProviderMessage[] {
  const capability = getProviderCapabilityMetadata(provider);

  return messages
    .map((message) => ({
      ...message,
      content: normalizeMessageContent(message.content),
    }))
    .filter((message) => message.content.length > 0)
    .filter((message) => {
      if (message.role !== "system") {
        return true;
      }

      return capability.supportsSystemMessages;
    });
}
