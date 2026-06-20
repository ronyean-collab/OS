import type { ReactNode } from "react";

export type CloudProviderSetupCardProps = {
  providerId?: string;
  title?: string;
  className?: string;
  children?: ReactNode;
  [key: string]: unknown;
};

/**
 * Compatibility-only component retained so older settings views compile.
 *
 * Polaris is local-first and Ollama-only. This component intentionally
 * contains no API-key form, connection tester, network request, or save action.
 */
export function CloudProviderSetupCard({
  providerId,
  title,
  className,
  children,
}: CloudProviderSetupCardProps) {
  const providerLabel =
    typeof title === "string" && title.trim()
      ? title.trim()
      : typeof providerId === "string" && providerId.trim()
        ? providerId.trim()
        : "Cloud provider";

  return (
    <section
      className={[
        "provider-catalog-setup-card",
        "provider-catalog-setup-card-disabled",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      data-testid={
        providerId
          ? `provider-setup-${providerId}`
          : "provider-setup-disabled"
      }
      aria-disabled="true"
    >
      <header className="provider-catalog-setup-header">
        <strong>{providerLabel}</strong>
        <span className="provider-pill">Unavailable</span>
      </header>

      <p>
        Polaris uses local Ollama models only. Remote provider setup is
        disabled.
      </p>

      {children}
    </section>
  );
}
