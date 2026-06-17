/** Classify errors as external network vs local runtime — never conflate them. */

export type ConnectivityFailureKind =
  | "external_offline"
  | "local_runtime"
  | "unknown";

const LOCAL_HOST_PATTERN =
  /localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|11435|11434/i;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
}

export function isLocalServiceUrl(url: string | null | undefined): boolean {
  if (!url?.trim()) return false;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return LOCAL_HOST_PATTERN.test(url);
  }
}

/**
 * External internet required (model installer download, registry fetch).
 * Local ECONNREFUSED to Ollama is NOT offline — runtime is down or not started.
 */
export function classifyConnectivityFailure(
  error: unknown,
  context?: { targetUrl?: string | null },
): ConnectivityFailureKind {
  const message = errorMessage(error);
  const localTarget =
    isLocalServiceUrl(context?.targetUrl ?? null) ||
    LOCAL_HOST_PATTERN.test(message);

  if (localTarget) {
    if (
      message.includes("econnrefused") ||
      message.includes("enotfound") ||
      message.includes("not reachable") ||
      message.includes("did not start")
    ) {
      return "local_runtime";
    }
    if (message.includes("fetch") || message.includes("network")) {
      return "local_runtime";
    }
  }

  if (
    message.includes("network offline") ||
    message.includes("err_internet_disconnected") ||
    message.includes("failed to fetch") && message.includes("ollama.com")
  ) {
    return "external_offline";
  }

  if (
    message.includes("abort") &&
    (message.includes("timeout") || message.includes("timed out"))
  ) {
    return context?.targetUrl && isLocalServiceUrl(context.targetUrl)
      ? "local_runtime"
      : "external_offline";
  }

  if (
    message.includes("fetch failed") ||
    message.includes("getaddrinfo") ||
    message.includes("network") ||
    (message.includes("timed out") && !localTarget)
  ) {
    return "external_offline";
  }

  if (message.includes("econnrefused") || message.includes("enotfound")) {
    return "local_runtime";
  }

  return "unknown";
}

export function isExternalNetworkOffline(
  error: unknown,
  context?: { targetUrl?: string | null },
): boolean {
  return classifyConnectivityFailure(error, context) === "external_offline";
}

export function isLocalRuntimeUnreachable(
  error: unknown,
  context?: { targetUrl?: string | null },
): boolean {
  return classifyConnectivityFailure(error, context) === "local_runtime";
}
