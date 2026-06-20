import type { ReactNode } from "react";

export type TransferStatusState = {
  phase?: string;
  message?: string | null;
  detail?: string | null;
  progress?: number | null;
  percent?: number | null;
  error?: string | null;
  fileName?: string | null;
};

export type TransferStatusBannerProps = {
  state: TransferStatusState | null | undefined;
  onDismiss?: () => void;
  children?: ReactNode;
};

function normalizeText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized ? normalized : null;
}

function clampPercent(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  const percentage = value <= 1 ? value * 100 : value;

  return Math.max(0, Math.min(100, Math.round(percentage)));
}

export function TransferStatusBanner({
  state,
  onDismiss,
  children,
}: TransferStatusBannerProps) {
  const phase = normalizeText(state?.phase)?.toLowerCase() ?? "idle";

  if (phase === "idle" || phase === "none" || phase === "hidden") {
    return null;
  }

  const progress =
    clampPercent(state?.percent) ??
    clampPercent(state?.progress);

  const error = normalizeText(state?.error);
  const detail = normalizeText(state?.detail);
  const fileName = normalizeText(state?.fileName);

  const message =
    error ??
    normalizeText(state?.message) ??
    (phase === "complete" || phase === "completed"
      ? "Transfer complete."
      : phase === "failed" || phase === "error"
        ? "Transfer could not be completed."
        : "Transfer in progress…");

  const isFinished =
    phase === "complete" ||
    phase === "completed" ||
    phase === "failed" ||
    phase === "error" ||
    phase === "cancelled";

  return (
    <section
      className={`transfer-status-banner transfer-status-${phase}`}
      role={error ? "alert" : "status"}
      aria-live={error ? "assertive" : "polite"}
      data-testid="transfer-status-banner"
    >
      <div className="transfer-status-copy">
        <strong>{message}</strong>

        {fileName ? (
          <span className="transfer-status-file">{fileName}</span>
        ) : null}

        {detail ? (
          <span className="transfer-status-detail">{detail}</span>
        ) : null}

        {children}
      </div>

      {progress !== null && !isFinished ? (
        <div
          className="transfer-status-progress"
          role="progressbar"
          aria-label="Transfer progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
        >
          <div
            className="transfer-status-progress-value"
            style={{ width: `${progress}%` }}
          />
          <span>{progress}%</span>
        </div>
      ) : null}

      {onDismiss && isFinished ? (
        <button
          type="button"
          className="transfer-status-dismiss"
          onClick={onDismiss}
          aria-label="Dismiss transfer status"
        >
          Dismiss
        </button>
      ) : null}
    </section>
  );
}
