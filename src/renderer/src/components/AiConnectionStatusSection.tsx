import type { ReactNode } from "react";

type LooseStatusSource = Record<string, unknown>;

export type AiConnectionStatusSectionProps = {
  appState?: LooseStatusSource | null;
  state?: LooseStatusSource | null;
  status?: LooseStatusSource | null;
  title?: string;
  className?: string;
  children?: ReactNode;
  [key: string]: unknown;
};

function readBoolean(
  source: LooseStatusSource | null | undefined,
  keys: string[],
): boolean | null {
  if (!source) {
    return null;
  }

  for (const key of keys) {
    const value = source[key];

    if (typeof value === "boolean") {
      return value;
    }
  }

  return null;
}

function readText(
  source: LooseStatusSource | null | undefined,
  keys: string[],
): string | null {
  if (!source) {
    return null;
  }

  for (const key of keys) {
    const value = source[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

export function AiConnectionStatusSection(
  props: AiConnectionStatusSectionProps,
) {
  const source = props.appState ?? props.state ?? props.status ?? null;

  const ready =
    readBoolean(source, [
      "defaultAiCanReply",
      "canReply",
      "providerReady",
      "ready",
      "isReady",
    ]) ?? false;

  const preparing =
    readBoolean(source, [
      "defaultAiPreparing",
      "preparing",
      "isPreparing",
      "starting",
    ]) ?? false;

  const error =
    readText(source, [
      "defaultAiError",
      "error",
      "errorMessage",
    ]);

  const detail =
    error ??
    readText(source, [
      "defaultAiStatusMessage",
      "message",
      "detail",
      "reason",
    ]);

  const tone = error
    ? "error"
    : ready
      ? "ready"
      : preparing
        ? "working"
        : "waiting";

  const label = error
    ? "Local AI needs attention"
    : ready
      ? "Local AI ready"
      : preparing
        ? "Preparing local AI"
        : "Local AI not ready";

  return (
    <section
      className={[
        "ai-connection-status-section",
        `ai-connection-status-${tone}`,
        props.className,
      ]
        .filter(Boolean)
        .join(" ")}
      data-testid="ai-connection-status-section"
      aria-live="polite"
    >
      <div className="ai-connection-status-heading">
        <span
          className={`provider-pill ${
            ready ? "ready" : error ? "warn" : ""
          }`.trim()}
        >
          {label}
        </span>

        {props.title ? <strong>{props.title}</strong> : null}
      </div>

      {detail ? (
        <p className="ai-connection-status-detail">{detail}</p>
      ) : null}

      {props.children}
    </section>
  );
}
