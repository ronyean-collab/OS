import type {
  ProviderAdapter,
  ProviderCompletionRequest,
  ProviderCompletionResult,
  StreamLifecycleHandlers,
} from "./types";

type OllamaChatResponse = {
  model?: string;
  message?: {
    content?: string;
  };
  error?: string;
};

function resolveBaseUrl(connection: string | null): string {
  const trimmed = connection?.trim();
  if (!trimmed) {
    throw new Error("Set the Ollama base URL in Provider settings.");
  }
  return trimmed.replace(/\/$/, "");
}

async function requestOllamaCompletion(
  request: ProviderCompletionRequest,
  connection: string | null,
  signal?: AbortSignal,
): Promise<ProviderCompletionResult> {
  const baseUrl = resolveBaseUrl(connection);
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: request.model,
      messages: request.messages,
      stream: false,
    }),
    signal,
  });

  if (!response.ok) {
    throw new Error(
      `Local Ollama server returned HTTP ${response.status}. Confirm Ollama is running and the base URL is correct.`,
    );
  }

  const body = (await response.json()) as OllamaChatResponse;
  const content = body.message?.content?.trim() ?? "";
  if (!content) {
    throw new Error(body.error?.trim() || "Ollama returned an empty response.");
  }

  return {
    content,
    model: body.model?.trim() || request.model,
    rawPayload: {
      provider: "ollama",
      model: body.model?.trim() || request.model,
      streamed: false,
    },
  };
}

export class OllamaAdapter implements ProviderAdapter {
  readonly id = "ollama";

  isConfigured(connection: string | null): boolean {
    return Boolean(connection?.trim());
  }

  async complete(
    request: ProviderCompletionRequest,
    connection: string,
  ): Promise<ProviderCompletionResult> {
    return requestOllamaCompletion(request, connection);
  }

  async streamMessage(
    request: ProviderCompletionRequest,
    connection: string,
    handlers: StreamLifecycleHandlers,
    signal?: AbortSignal,
  ): Promise<void> {
    try {
      const result = await requestOllamaCompletion(request, connection, signal);
      if (signal?.aborted) {
        handlers.onError(new Error("Stream cancelled"));
        return;
      }
      handlers.onChunk(result.content, result.content);
      handlers.onComplete(result);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      if (signal?.aborted || error.name === "AbortError") {
        handlers.onError(new Error("Stream cancelled"));
        return;
      }
      handlers.onError(error);
    }
  }

  cancelStream(_streamId: string): void {}
}

export const ollamaAdapter = new OllamaAdapter();
