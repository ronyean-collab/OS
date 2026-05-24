import type {
  ProviderAdapter,
  ProviderCompletionRequest,
  ProviderCompletionResult,
  StreamLifecycleHandlers,
} from "./types";

/** Deterministic mock for Vitest — no network. */
export class MockProviderAdapter implements ProviderAdapter {
  readonly id = "mock";
  chunks: string[] = ["Hello", " ", "world"];
  delayMs = 0;
  shouldFail = false;
  lastStreamRequest: ProviderCompletionRequest | null = null;
  private abortControllers = new Map<string, AbortController>();

  isConfigured(apiKey: string | null): boolean {
    return Boolean(apiKey?.trim());
  }

  async complete(
    request: ProviderCompletionRequest,
    _apiKey: string,
  ): Promise<ProviderCompletionResult> {
    const content = this.chunks.join("");
    return {
      content,
      model: request.model,
      rawPayload: { mock: true },
    };
  }

  async streamMessage(
    request: ProviderCompletionRequest,
    _apiKey: string,
    handlers: StreamLifecycleHandlers,
    signal?: AbortSignal,
  ): Promise<void> {
    this.lastStreamRequest = request;
    let accumulated = "";
    for (const chunk of this.chunks) {
      if (signal?.aborted) {
        handlers.onError(new Error("Stream cancelled"));
        return;
      }
      if (this.delayMs > 0) {
        await new Promise((r) => setTimeout(r, this.delayMs));
      }
      accumulated += chunk;
      handlers.onChunk(chunk, accumulated);
    }
    if (this.shouldFail) {
      handlers.onError(new Error("Mock stream failure"));
      return;
    }
    handlers.onComplete({
      content: accumulated,
      model: "mock-model",
      rawPayload: { mock: true, streamed: true },
    });
  }

  cancelStream(streamId: string): void {
    this.abortControllers.get(streamId)?.abort();
  }

  registerAbort(streamId: string, controller: AbortController): void {
    this.abortControllers.set(streamId, controller);
  }
}
