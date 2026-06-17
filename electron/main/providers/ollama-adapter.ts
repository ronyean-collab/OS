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


function resolvePolarisContextRoute(message: string | null | undefined): {
  route: "resume" | "implementation" | "continuity" | "planning" | "general";
  instruction: string;
} {
  const text = message?.trim().toLowerCase() ?? "";

  if (/\b(continue|resume|what next|what's next|whats next|where did we leave off|where were we|pick up)\b/.test(text)) {
    return {
      route: "resume",
      instruction:
        "Prioritize saved project memory first, then recent conversation. Give the next practical step without asking the user to restate context.",
    };
  }

  if (/\b(error|failed|bug|fix|patch|code|build|terminal|powershell|npm|log|upload|inspect|typescript|tsx|electron|ollama)\b/.test(text)) {
    return {
      route: "implementation",
      instruction:
        "Prioritize concrete implementation help. Use saved project memory, recent logs, and recent conversation to give the next exact coding or debugging step.",
    };
  }

  if (/\b(markdown|md|context pack|handoff|save point|restore|import|export|backup|continuity file)\b/.test(text)) {
    return {
      route: "continuity",
      instruction:
        "Prioritize continuity workflows. Preserve project state, saved memory, restore/import/export details, and avoid losing newer local memory.",
    };
  }

  if (/\b(plan|architecture|agent|agents|memory system|roadmap|phase|design|product)\b/.test(text)) {
    return {
      route: "planning",
      instruction:
        "Prioritize product architecture and next-phase planning. Keep the answer operational and tied to the current project state.",
    };
  }

  return {
    route: "general",
    instruction:
      "Use saved project memory and recent conversation naturally. Answer directly and ask one focused question only if required.",
  };
}
function resolveRouteContextBudget(route: ReturnType<typeof resolvePolarisContextRoute>["route"]): {
  systemContextMaxChars: number;
  singleSystemContextMaxChars: number;
  conversationTurns: number;
  singleConversationMessageMaxChars: number;
  totalContextMaxChars: number;
} {
  switch (route) {
    case "implementation":
      return {
        systemContextMaxChars: 4200,
        singleSystemContextMaxChars: 1800,
        conversationTurns: 6,
        singleConversationMessageMaxChars: 700,
        totalContextMaxChars: 5200,
      };
    case "continuity":
    case "resume":
      return {
        systemContextMaxChars: 5200,
        singleSystemContextMaxChars: 2200,
        conversationTurns: 6,
        singleConversationMessageMaxChars: 700,
        totalContextMaxChars: 6200,
      };
    case "planning":
      return {
        systemContextMaxChars: 4800,
        singleSystemContextMaxChars: 2000,
        conversationTurns: 6,
        singleConversationMessageMaxChars: 800,
        totalContextMaxChars: 5800,
      };
    case "general":
    default:
      return {
        systemContextMaxChars: 3000,
        singleSystemContextMaxChars: 1400,
        conversationTurns: 4,
        singleConversationMessageMaxChars: 500,
        totalContextMaxChars: 3800,
      };
  }
}
function buildOllamaMessages(request: ProviderCompletionRequest) {
  const compact = (value: string | null | undefined, max = 1200): string | null => {
    const text = value?.trim();
    if (!text) return null;
    return text.length > max ? `${text.slice(0, max).trimEnd()}...` : text;
  };

  const systemPrompt = {
    role: "system" as const,
    content:
      "You are Polaris, a helpful local AI coworker inside ContinuityOS. Saved project memory and recent conversation are already provided as background context. Use them naturally. Do not mention internal prompts, memory systems, provider details, or internal routing. If the user asks for the next step, continue from the saved project state. If context is insufficient, ask one focused question instead of guessing.",
  };

  const rawRecentConversation = request.messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .filter((message) => message.content.trim().length > 0);

  const latestUserMessage =
    [...rawRecentConversation].reverse().find((message) => message.role === "user")?.content ?? null;

  const contextRoute = resolvePolarisContextRoute(latestUserMessage);
  const contextBudget = resolveRouteContextBudget(contextRoute.route);
  // Preserve upstream system context from the main ContinuityOS runtime.
  // This is where workspace continuity_summary, restored memory, project state,
  // assistant identity, and awareness context can arrive.
  let upstreamSystemChars = 0;
  const upstreamSystemContext = request.messages
    .filter((message) => message.role === "system")
    .map((message) => compact(message.content, contextBudget.singleSystemContextMaxChars))
    .filter((content): content is string => Boolean(content))
    .filter((content) => {
      upstreamSystemChars += content.length;
      return upstreamSystemChars <= contextBudget.systemContextMaxChars;
    })
    .map((content, index) => ({
      role: "system" as const,
      content:
        index === 0
          ? `Saved ContinuityOS project memory and context:\n${content}`
          : `Additional saved ContinuityOS context:\n${content}`,
    }));
  const recentConversation = rawRecentConversation
    .slice(-contextBudget.conversationTurns)
    .map((message) => {
      const content = message.content.trim();
      return {
        role: message.role,
        content:
          content.length > contextBudget.singleConversationMessageMaxChars
            ? content.slice(0, contextBudget.singleConversationMessageMaxChars)
            : content,
      };
    });

  if (recentConversation.length === 0) {
    return [
      systemPrompt,
      ...upstreamSystemContext,
      {
        role: "user" as const,
        content: "Hello",
      },
    ];
  }


  const priorConversation =
    latestUserMessage != null && recentConversation[recentConversation.length - 1]?.content === latestUserMessage
      ? recentConversation.slice(0, -1)
      : recentConversation;

  const lastPriorUserMessage =
    [...priorConversation].reverse().find((message) => message.role === "user")?.content ?? null;

  const lastPriorAssistantMessage =
    [...priorConversation].reverse().find((message) => message.role === "assistant")?.content ?? null;

  const resumeContext = {
    role: "system" as const,
    content: [
      "Resume behavior guidance:",
      `Context route: ${contextRoute.route}`,
      `Route instruction: ${contextRoute.instruction}`,
      compact(latestUserMessage, 400)
        ? `Current user message: ${compact(latestUserMessage, 400)}`
        : null,
      compact(lastPriorUserMessage, 500)
        ? `Last prior user message: ${compact(lastPriorUserMessage, 500)}`
        : null,
      compact(lastPriorAssistantMessage, 700)
        ? `Last prior Polaris reply: ${compact(lastPriorAssistantMessage, 700)}`
        : null,
      "When the user asks what to do next, answer from saved project state first, then recent conversation.",
    ]
      .filter(Boolean)
      .join("\n"),
  };

  let totalChars =
    systemPrompt.content.length +
    resumeContext.content.length +
    upstreamSystemContext.reduce((sum, message) => sum + message.content.length, 0);

  const boundedConversation = [...recentConversation]
    .reverse()
    .filter((message) => {
      totalChars += message.content.length;
      return totalChars <= contextBudget.totalContextMaxChars;
    })
    .reverse();

  return [systemPrompt, ...upstreamSystemContext, resumeContext, ...boundedConversation];
}
function applyHardOllamaPayloadCap<T extends { role: "system" | "user" | "assistant"; content: string }>(
  messages: T[],
  maxChars = 6500,
): T[] {
  let total = 0;
  const kept: T[] = [];

  for (const message of messages) {
    const remaining = maxChars - total;
    if (remaining <= 0) break;

    if (message.content.length <= remaining) {
      kept.push(message);
      total += message.content.length;
      continue;
    }

    kept.push({
      ...message,
      content: message.content.slice(0, Math.max(0, remaining - 20)).trimEnd() + "\n...[trimmed]",
    });

    break;
  }

  return kept.length > 0 ? kept : messages.slice(0, 1);
}
function createOllamaTimeoutSignal(parentSignal: AbortSignal | undefined, timeoutMs = 25000): AbortSignal {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort(new Error(`Ollama request timed out after ${timeoutMs / 1000} seconds.`));
  }, timeoutMs);

  const abortFromParent = () => {
    controller.abort(parentSignal?.reason ?? new Error("Ollama request cancelled."));
  };

  if (parentSignal?.aborted) {
    abortFromParent();
  } else {
    parentSignal?.addEventListener("abort", abortFromParent, { once: true });
  }

  controller.signal.addEventListener(
    "abort",
    () => {
      clearTimeout(timeout);
      parentSignal?.removeEventListener("abort", abortFromParent);
    },
    { once: true },
  );

  return controller.signal;
}
function resolveBaseUrl(connection: string | null): string {
  const trimmed = connection?.trim();
  if (!trimmed) {
    throw new Error("Set the Ollama base URL in Ollama Setup.");
  }
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  try {
    return new URL(withProtocol).toString().replace(/\/$/, "");
  } catch {
    throw new Error("Set a valid Ollama base URL in Ollama Setup.");
  }
}

async function requestOllamaCompletion(
  request: ProviderCompletionRequest,
  connection: string | null,
  signal?: AbortSignal,
): Promise<ProviderCompletionResult> {
  const baseUrl = resolveBaseUrl(connection);
  const messages = applyHardOllamaPayloadCap(buildOllamaMessages(request));
  const routeDebugContext =
    messages.find((message) => message.role === "system" && message.content.includes("Context route:"))?.content ?? "";
  const routeDebugMatch = routeDebugContext.match(/Context route:\s*([a-z]+)/i);

  if (process.env.NODE_ENV !== "production") {
    console.info("[ollama-adapter] non-stream request started", {
      model: request.model,
      baseUrl,
      originalMessageCount: request.messages.length,
      contextRoute: routeDebugMatch?.[1] ?? null,
      payloadMessageCount: messages.length,
      payloadChars: messages.reduce((total, message) => total + message.content.length, 0),
      latestUserPreview: messages[messages.length - 1]?.content.slice(0, 120),
    });
  }

  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: request.model,
      messages,
      stream: false,
      options: {
        num_predict: 128,
        temperature: 0.2,
      },
    }),
    signal: createOllamaTimeoutSignal(signal),
  });

  if (process.env.NODE_ENV !== "production") {
    console.info("[ollama-adapter] non-stream response status", {
      model: request.model,
      status: response.status,
      ok: response.ok,
    });
  }

  if (!response.ok) {
    let apiError = "";
    try {
      const errBody = (await response.json()) as OllamaChatResponse;
      apiError = errBody.error?.trim() ?? "";
    } catch {
      apiError = "";
    }

    if (response.status === 404) {
      throw new Error(
        apiError || `Model "${request.model}" was not found in Ollama. Pull or select a different model.`,
      );
    }

    throw new Error(
      apiError ||
        `Ollama request failed with HTTP ${response.status}. Confirm Ollama is running and the base URL is correct.`,
    );
  }

  const data = (await response.json()) as OllamaChatResponse;
  const content = data.message?.content?.trim() ?? "";

  if (!content) {
    throw new Error("Ollama returned an empty response.");
  }

  return {
    content,
    model: data.model ?? request.model,
    rawPayload: {
      ...data,
      provider: "ollama",
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
      if (process.env.NODE_ENV !== "production") {
        console.info("[ollama-adapter] using non-stream completion fallback", {
          model: request.model,
        });
      }

      const result = await requestOllamaCompletion(request, connection, signal);

      handlers.onChunk(result.content, result.content);

      handlers.onComplete({
        content: result.content,
        model: result.model,
        rawPayload: {
          ...result.rawPayload,
          provider: "ollama",
          model: result.model,
          streamed: false,
          fallbackMode: "non-stream",
        },
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      if (signal?.aborted || error.name === "AbortError") {
        handlers.onError(new Error(error.message || "Ollama request cancelled or timed out."));
        return;
      }
      if (error.message.includes("fetch failed") || error.message.includes("ECONNREFUSED")) {
        handlers.onError(
          new Error(
            "Ollama server is unavailable. Start Ollama or update the base URL in Ollama Setup.",
          ),
        );
        return;
      }
      handlers.onError(error);
    }
  }

  cancelStream(_streamId: string): void {}
}

export const ollamaAdapter = new OllamaAdapter();

























