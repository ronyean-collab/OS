import OpenAI from "openai";
import type {
  ProviderAdapter,
  ProviderCompletionRequest,
  ProviderCompletionResult,
  ProviderMessage,
  StreamLifecycleHandlers,
} from "./types";

import { DEFAULT_OPENAI_MODEL } from "../../../src/shared/provider-defaults";

const DEFAULT_MODEL = DEFAULT_OPENAI_MODEL;
const activeAbortControllers = new Map<string, AbortController>();

function toOpenAiMessages(messages: ProviderMessage[]): OpenAI.Chat.ChatCompletionMessageParam[] {
  return messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));
}

/**
 * OpenAI provider — official SDK, streaming + cancellation.
 */
export class OpenAIAdapter implements ProviderAdapter {
  readonly id = "openai";

  isConfigured(apiKey: string | null): boolean {
    return Boolean(apiKey?.trim());
  }

  private createClient(apiKey: string, signal?: AbortSignal): OpenAI {
    return new OpenAI({
      apiKey,
      ...(signal ? { signal } : {}),
    });
  }

  async complete(
    request: ProviderCompletionRequest,
    apiKey: string,
  ): Promise<ProviderCompletionResult> {
    if (!this.isConfigured(apiKey)) {
      throw new Error("OpenAI API key is not configured.");
    }
    const client = this.createClient(apiKey);
    const model = request.model?.trim() || DEFAULT_MODEL;
    const response = await client.chat.completions.create({
      model,
      messages: toOpenAiMessages(request.messages),
      stream: false,
    });
    const choice = response.choices[0];
    const content = choice?.message?.content ?? "";
    return {
      content,
      model: response.model ?? model,
      rawPayload: response as unknown as Record<string, unknown>,
    };
  }

  async streamMessage(
    request: ProviderCompletionRequest,
    apiKey: string,
    handlers: StreamLifecycleHandlers,
    signal?: AbortSignal,
  ): Promise<void> {
    if (!this.isConfigured(apiKey)) {
      throw new Error("OpenAI API key is not configured.");
    }

    const client = this.createClient(apiKey, signal);
    const model = request.model?.trim() || DEFAULT_MODEL;
    let accumulated = "";

    try {
      const stream = await client.chat.completions.create({
        model,
        messages: toOpenAiMessages(request.messages),
        stream: true,
      });

      for await (const chunk of stream) {
        if (signal?.aborted) {
          const aborted = new Error("Stream aborted");
          aborted.name = "AbortError";
          throw aborted;
        }
        const delta = chunk.choices[0]?.delta?.content ?? "";
        if (!delta) continue;
        accumulated += delta;
        handlers.onChunk(delta, accumulated);
      }

      handlers.onComplete({
        content: accumulated,
        model,
        rawPayload: {
          provider: "openai",
          model,
          streamed: true,
          finishReason: "stop",
        },
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      if (signal?.aborted || error.name === "AbortError") {
        handlers.onError(new Error("Stream cancelled"));
        return;
      }
      handlers.onError(error);
    }
  }

  cancelStream(streamId: string): void {
    const controller = activeAbortControllers.get(streamId);
    if (controller) {
      controller.abort();
      activeAbortControllers.delete(streamId);
    }
  }

  /** Register abort controller for a stream session (called by runtime). */
  registerStreamAbort(streamId: string, controller: AbortController): void {
    activeAbortControllers.set(streamId, controller);
  }

  unregisterStreamAbort(streamId: string): void {
    activeAbortControllers.delete(streamId);
  }
}

export const openAIAdapter = new OpenAIAdapter();
