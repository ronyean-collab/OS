export type ProviderMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type ProviderCompletionRequest = {
  model: string;
  messages: ProviderMessage[];
  /** Optional base URL for local or compatible endpoints. */
  baseUrl?: string | null;
};

export type ProviderCompletionResult = {
  content: string;
  rawPayload: Record<string, unknown>;
  model: string;
};

export type StreamChunkHandler = (delta: string, accumulated: string) => void;

export type StreamLifecycleHandlers = {
  onChunk: StreamChunkHandler;
  onComplete: (result: ProviderCompletionResult) => void;
  onError: (error: Error) => void;
};

/** Provider adapter contract — local-compatible runtimes implement this. */
export interface ProviderAdapter {
  readonly id: string;
  isConfigured(apiKey: string | null): boolean;
  /** Non-streaming completion (tests / fallback). */
  complete(
    request: ProviderCompletionRequest,
    apiKey: string,
  ): Promise<ProviderCompletionResult>;
  /** Streaming completion — calls handlers as tokens arrive. */
  streamMessage(
    request: ProviderCompletionRequest,
    apiKey: string,
    handlers: StreamLifecycleHandlers,
    signal?: AbortSignal,
  ): Promise<void>;
  /** Cancel an in-flight stream by stream id. */
  cancelStream(streamId: string): void;
}
