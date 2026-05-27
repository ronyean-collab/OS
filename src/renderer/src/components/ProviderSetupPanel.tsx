import { useEffect, useRef, useState } from "react";
import type { LocalAiStatus, ProviderConfig, ProviderTestResult } from "@shared/types";
import { formatProviderSaveError } from "@shared/provider-errors";
import { getProviderDefinition } from "@shared/provider-definitions";

export type ProviderSetupPanelProps = {
  workspaceId: string;
  initial: ProviderConfig | null;
  initialProviderId?: string;
  focusLocalAiSignal?: number;
  onSave: (
    provider: string,
    model: string,
    apiKey: string,
    baseUrl: string,
  ) => Promise<void>;
  onTest: (
    provider: string,
    model: string,
    apiKey: string,
    baseUrl: string,
  ) => Promise<ProviderTestResult>;
  onRemoveKey: (provider: string) => Promise<void>;
  onOpenUrl: (url: string) => void;
};

export function ProviderSetupPanel({
  workspaceId,
  initial,
  focusLocalAiSignal = 0,
  onSave,
  onTest,
  onOpenUrl,
}: ProviderSetupPanelProps) {
  const ollamaDef = getProviderDefinition("ollama");
  const [localModel, setLocalModel] = useState(
    initial?.provider === "ollama" ? initial.model : ollamaDef.recommendedModel,
  );
  const [baseUrl, setBaseUrl] = useState(
    initial?.provider === "ollama"
      ? initial.baseUrl ?? ollamaDef.defaultBaseUrl ?? ""
      : ollamaDef.defaultBaseUrl ?? "",
  );
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [banner, setBanner] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);
  const [lastTest, setLastTest] = useState<ProviderTestResult | null>(null);
  const [localAiStatus, setLocalAiStatus] = useState<LocalAiStatus | null>(null);
  const [loadingLocalAi, setLoadingLocalAi] = useState(false);
  const [highlightLocalAi, setHighlightLocalAi] = useState(false);
  const localAiPanelRef = useRef<HTMLElement>(null);

  const refreshLocalAi = async () => {
    if (!window.continuity?.getLocalAiStatus) return;
    setLoadingLocalAi(true);
    try {
      const status = await window.continuity.getLocalAiStatus(
        workspaceId,
        baseUrl.trim() || undefined,
      );
      setLocalAiStatus(status);
      if (status.detected && status.baseUrl) {
        setBaseUrl(status.baseUrl);
      }
      if (status.selectedModel) {
        setLocalModel(status.selectedModel);
      } else if (status.models.length > 0) {
        setLocalModel((current) =>
          status.models.includes(current) ? current : status.models[0],
        );
      }
    } finally {
      setLoadingLocalAi(false);
    }
  };

  useEffect(() => {
    void refreshLocalAi();
  }, [workspaceId]);

  useEffect(() => {
    if (!focusLocalAiSignal) return;
    localAiPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    setHighlightLocalAi(true);
    const timer = window.setTimeout(() => setHighlightLocalAi(false), 2200);
    return () => window.clearTimeout(timer);
  }, [focusLocalAiSignal]);
  const canSave = Boolean(localModel.trim() && baseUrl.trim());
  const canTest = Boolean(baseUrl.trim());

  const runTest = async () => {
    setTesting(true);
    setBanner(null);
    setLastTest(null);
    try {
      const result = await onTest("ollama", localModel, "", baseUrl);
      setLastTest(result);
      setBanner({
        tone: result.ok ? "success" : "error",
        message: result.message,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Connection test could not complete.";
      setBanner({ tone: "error", message });
      if (import.meta.env.DEV) {
        console.error("[continuity] provider test failed");
      }
    } finally {
      setTesting(false);
    }
  };

  const useLocalAi = async () => {
    setSaving(true);
    setBanner(null);
    try {
      const nextBaseUrl = baseUrl.trim() || localAiStatus?.baseUrl || ollamaDef.defaultBaseUrl || "";
      if (!nextBaseUrl) {
        throw new Error("Ollama base URL is required.");
      }
      await onSave("ollama", localModel, "", nextBaseUrl);
      setBanner({
        tone: "success",
        message: "Ollama saved successfully.",
      });
      await refreshLocalAi();
    } catch (err) {
      setBanner({
        tone: "error",
        message: formatProviderSaveError(err),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="provider-setup-panel" data-testid="provider-setup-panel">
      <p className="muted small">
        ContinuityOS now uses Ollama as the only in-app chat engine. Local memory, markdown
        import/export, and backups still work even when Ollama is offline.
      </p>

      <section
        ref={localAiPanelRef}
        className={`local-ai-panel${highlightLocalAi ? " is-highlighted" : ""}`}
        aria-label="Ollama Setup"
      >
        <div className="local-ai-panel-header">
          <div>
            <h3>Ollama Setup</h3>
            <p className="muted small">Run AI on your computer. No API key required.</p>
          </div>
          <span className={localAiStatus?.detected ? "provider-pill ready" : "provider-pill"}>
            {localAiStatus?.detected ? "Ollama detected" : "Ollama not detected"}
          </span>
        </div>
        <p className="muted small">
          {localAiStatus?.message ??
            "Detect Ollama to see whether local chat is available on this machine."}
        </p>
        <div className="local-ai-stats">
          <span>
            Workspace: <span className="mono">{workspaceId.slice(0, 8)}…</span>
          </span>
          <span>
            Base URL:{" "}
            <span className="mono">
              {localAiStatus?.baseUrl ?? ollamaDef.defaultBaseUrl ?? "http://localhost:11434"}
            </span>
          </span>
          <span>
            Models:{" "}
            <span className="mono">
              {localAiStatus?.models.length ? localAiStatus.models.join(", ") : "None listed"}
            </span>
          </span>
        </div>
        <div className="provider-instructions" data-testid="provider-instructions">
          <h3>Install or start Ollama</h3>
          <ol className="muted small">
            {ollamaDef.setupSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          {ollamaDef.docsUrl && (
            <button
              type="button"
              className="secondary small-btn"
              onClick={() => onOpenUrl(ollamaDef.docsUrl!)}
            >
              Open Ollama docs
            </button>
          )}
        </div>
        <label>
          Ollama base URL
          <input
            value={baseUrl}
            onChange={(e) => {
              setBaseUrl(e.target.value);
              setBanner(null);
            }}
            placeholder={ollamaDef.defaultBaseUrl ?? "http://localhost:11434"}
          />
        </label>
        {!localAiStatus?.detected && (
          <p className="muted small">
            ContinuityOS checks `OLLAMA_HOST` first, then the common local URLs on ports `11434`
            and `11500`. If your Ollama server uses another address, enter it here and click
            `Detect Ollama`.
          </p>
        )}
        <label>
          Selected Ollama model
          <select
            value={localModel}
            onChange={(e) => setLocalModel(e.target.value)}
            disabled={loadingLocalAi || (localAiStatus?.models.length ?? 0) === 0}
          >
            {(localAiStatus?.models.length ? localAiStatus.models : [ollamaDef.recommendedModel]).map(
              (option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ),
            )}
          </select>
        </label>
        <div className="provider-tab-actions">
          <button
            type="button"
            className="secondary"
            disabled={loadingLocalAi}
            onClick={() => void refreshLocalAi()}
          >
            {loadingLocalAi ? "Checking…" : "Detect Ollama"}
          </button>
          <button
            type="button"
            className="secondary"
            disabled={loadingLocalAi}
            onClick={() => void refreshLocalAi()}
          >
            Refresh models
          </button>
          <button
            type="button"
            className="secondary"
            disabled={testing || !localModel || !canTest}
            onClick={() => void runTest()}
          >
            {testing ? "Testing…" : "Test Ollama"}
          </button>
          <button
            type="button"
            disabled={saving || !canSave}
            onClick={() => void useLocalAi()}
          >
            {saving ? "Saving…" : "Use Ollama for Chat"}
          </button>
        </div>
        <p className="muted small">{ollamaDef.billingNote}</p>
        <p className="muted small">{ollamaDef.privacyNote}</p>
      </section>

      {lastTest && (
        <p className="muted small">Last test: {lastTest.status.replace(/_/g, " ")}</p>
      )}

      {banner && (
        <p
          className={
            banner.tone === "success" ? "provider-banner success" : "provider-banner error"
          }
          role="status"
        >
          {banner.message}
        </p>
      )}
    </div>
  );
}
