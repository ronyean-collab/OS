import { useEffect, useMemo, useState } from "react";
import type {
  LocalAiStatus,
  ProviderConfig,
  ProviderTestResult,
  SecureStorageDiagnostics,
} from "@shared/types";
import { formatProviderSaveError } from "@shared/provider-errors";
import {
  getProviderDefinition,
  listProviderDefinitions,
  providerStatusLabel,
} from "@shared/provider-definitions";

export type ProviderSetupPanelProps = {
  workspaceId: string;
  initial: ProviderConfig | null;
  initialProviderId?: string;
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

function maskStoredKey(hasKey: boolean): string {
  return hasKey ? "••••••••••••••••••••••••••••••" : "";
}

export function ProviderSetupPanel({
  workspaceId,
  initial,
  initialProviderId,
  onSave,
  onTest,
  onRemoveKey,
  onOpenUrl,
}: ProviderSetupPanelProps) {
  const ollamaDef = getProviderDefinition("ollama");
  const [provider, setProvider] = useState(
    initialProviderId ?? initial?.provider ?? "openai",
  );
  const def = getProviderDefinition(provider);
  const [model, setModel] = useState(initial?.model ?? def.recommendedModel);
  const [localModel, setLocalModel] = useState(
    initial?.provider === "ollama" ? initial.model : ollamaDef.recommendedModel,
  );
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(
    initial?.baseUrl ?? def.defaultBaseUrl ?? "",
  );
  const [hasStoredKey, setHasStoredKey] = useState(
    initial?.provider === provider ? (initial?.hasApiKey ?? false) : false,
  );
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [banner, setBanner] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);
  const [lastTest, setLastTest] = useState<ProviderTestResult | null>(null);
  const [secureDiag, setSecureDiag] = useState<SecureStorageDiagnostics | null>(null);
  const [localAiStatus, setLocalAiStatus] = useState<LocalAiStatus | null>(null);
  const [loadingLocalAi, setLoadingLocalAi] = useState(false);

  useEffect(() => {
    if (!window.continuity?.getSecureStorageDiagnostics) return;
    void window.continuity.getSecureStorageDiagnostics().then(setSecureDiag).catch(() => {
      setSecureDiag(null);
    });
  }, []);

  const refreshLocalAi = async () => {
    if (!window.continuity?.getLocalAiStatus) return;
    setLoadingLocalAi(true);
    try {
      const status = await window.continuity.getLocalAiStatus(workspaceId);
      setLocalAiStatus(status);
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
    const next = getProviderDefinition(provider);
    setModel((m) =>
      next.modelOptions.some((o) => o.id === m) ? m : next.recommendedModel,
    );
    setBaseUrl((b) => b || next.defaultBaseUrl || "");
    if (initial?.provider === provider) {
      setHasStoredKey(initial.hasApiKey);
    } else {
      setHasStoredKey(false);
    }
    setApiKey("");
    setBanner(null);
    setLastTest(null);
  }, [provider, initial]);

  const keyPreview = useMemo(() => {
    if (apiKey.trim()) {
      const tail = apiKey.trim().slice(-4);
      return `••••••••••••${tail}`;
    }
    return maskStoredKey(hasStoredKey);
  }, [apiKey, hasStoredKey]);

  const canSave = Boolean(
    provider.trim() &&
      model.trim() &&
      (!def.requiresApiKey || apiKey.trim().length > 0 || hasStoredKey) &&
      (!def.requiresBaseUrl || baseUrl.trim().length > 0),
  );

  const canTest =
    def.id === "openai"
      ? apiKey.trim().length > 0 || hasStoredKey
      : def.id === "ollama"
        ? baseUrl.trim().length > 0
        : apiKey.trim().length > 0 || hasStoredKey;

  const runTest = async () => {
    setTesting(true);
    setBanner(null);
    setLastTest(null);
    try {
      const result = await onTest(provider, model, apiKey, baseUrl);
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

  const runLocalAiTest = async () => {
    if (!localAiStatus) return;
    setTesting(true);
    setBanner(null);
    setLastTest(null);
    try {
      const result = await onTest("ollama", localModel, "", localAiStatus.baseUrl);
      setLastTest(result);
      setBanner({
        tone: result.ok ? "success" : "error",
        message: result.message,
      });
    } catch (err) {
      setBanner({
        tone: "error",
        message: err instanceof Error ? err.message : "Local AI test could not complete.",
      });
    } finally {
      setTesting(false);
    }
  };

  const useLocalAi = async () => {
    if (!localAiStatus) return;
    setSaving(true);
    setBanner(null);
    try {
      setProvider("ollama");
      setModel(localModel);
      setBaseUrl(localAiStatus.baseUrl);
      await onSave("ollama", localModel, "", localAiStatus.baseUrl);
      setBanner({
        tone: "success",
        message: "Local AI saved successfully.",
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
        Provider setup is optional. Manual Mode works without any API key.
      </p>
      <p className="muted small">
        Workspace <span className="mono">{workspaceId.slice(0, 8)}…</span> —{" "}
        <span className={def.status === "ready" ? "provider-pill ready" : "provider-pill"}>
          {providerStatusLabel(def.status)}
        </span>
      </p>

      <section className="local-ai-panel" aria-label="Local AI">
        <div className="local-ai-panel-header">
          <div>
            <h3>Local AI</h3>
            <p className="muted small">Run AI on your computer. No API key required.</p>
          </div>
          <span className={localAiStatus?.detected ? "provider-pill ready" : "provider-pill"}>
            {localAiStatus?.detected ? "Ollama detected" : "Ollama not detected"}
          </span>
        </div>
        <p className="muted small">
          {localAiStatus?.message ??
            "Detect Ollama to see whether Local AI is available on this machine."}
        </p>
        <div className="local-ai-stats">
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
        <label>
          Selected local model
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
            disabled={testing || !localAiStatus?.detected || !localModel}
            onClick={() => void runLocalAiTest()}
          >
            {testing ? "Testing…" : "Test Local AI"}
          </button>
          <button
            type="button"
            disabled={saving || !localAiStatus?.detected || !localModel}
            onClick={() => void useLocalAi()}
          >
            {saving ? "Saving…" : "Use Local AI"}
          </button>
        </div>
      </section>

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

      <label>
        Provider
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          data-testid="provider-select"
        >
          {listProviderDefinitions().map((p) => (
            <option key={p.id} value={p.id}>
              {p.displayName}
            </option>
          ))}
        </select>
      </label>

      <div className="provider-instructions" data-testid="provider-instructions">
        <h3>{def.displayName} setup</h3>
        <p className="muted small">{def.description}</p>
        <ol className="muted small">
          {def.setupSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        {def.apiKeyUrl && (
          <button
            type="button"
            className="secondary small-btn"
            onClick={() => onOpenUrl(def.apiKeyUrl!)}
          >
            Open API key page
          </button>
        )}
        {def.docsUrl && (
          <button
            type="button"
            className="secondary small-btn"
            onClick={() => onOpenUrl(def.docsUrl!)}
          >
            View documentation
          </button>
        )}
        <p className="muted small">{def.billingNote}</p>
        <p className="muted small">{def.privacyNote}</p>
      </div>

      {def.requiresBaseUrl && (
        <label>
          API base URL
          <input
            value={baseUrl}
            onChange={(e) => {
              setBaseUrl(e.target.value);
              setBanner(null);
            }}
            placeholder={def.defaultBaseUrl ?? "https://…"}
          />
        </label>
      )}

      <label>
        Model
        <select
          value={model}
          onChange={(e) => {
            setModel(e.target.value);
            setBanner(null);
          }}
        >
          {def.modelOptions.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>

      {def.requiresApiKey && (
        <label>
          {def.apiKeyLabel}
          <input
            type="password"
            value={apiKey}
            autoComplete="off"
            onChange={(e) => {
              setApiKey(e.target.value);
              setBanner(null);
            }}
            placeholder={def.apiKeyPlaceholder}
          />
        </label>
      )}

      {def.requiresApiKey && keyPreview && (
        <p className="muted small provider-key-mask">
          Saved key: <span className="mono">{keyPreview}</span>
          {hasStoredKey && !apiKey.trim() && " (unchanged if you save without typing)"}
        </p>
      )}

      {def.requiresApiKey && hasStoredKey && (
        <button
          type="button"
          className="secondary small-btn"
          disabled={removing || saving}
          onClick={() => {
            setRemoving(true);
            void onRemoveKey(provider)
              .then(() => {
                setHasStoredKey(false);
                setApiKey("");
                setBanner({
                  tone: "success",
                  message: "API key removed from secure storage.",
                });
              })
              .catch((err) => {
                setBanner({
                  tone: "error",
                  message:
                    err instanceof Error ? err.message : "Could not remove API key.",
                });
              })
              .finally(() => setRemoving(false));
          }}
        >
          {removing ? "Removing…" : "Remove key"}
        </button>
      )}

        {lastTest && (
          <p className="muted small">Last test: {lastTest.status.replace(/_/g, " ")}</p>
        )}

        {secureDiag && (
          <details className="secure-storage-diagnostics muted small">
            <summary>Secure storage diagnostic</summary>
            <ul>
              <li>
                Available: {secureDiag.secureStorageAvailable ? "yes" : "no"}
              </li>
              <li>
                Encryption: {secureDiag.encryptionAvailable ? "yes" : "no"}
              </li>
              <li>
                Directory:{" "}
                <span className="mono">{secureDiag.secretsDirectory ?? "—"}</span>
              </li>
              {secureDiag.lastError && (
                <li>
                  Last error: <span className="mono">{secureDiag.lastError}</span>
                </li>
              )}
            </ul>
          </details>
        )}

        <div className="provider-tab-actions">
        <button
          type="button"
          className="secondary"
          disabled={testing || saving || !canTest}
          onClick={() => void runTest()}
        >
          {testing ? "Testing…" : "Test connection"}
        </button>
        <button
          type="button"
          disabled={saving || !canSave}
          onClick={() => {
            setSaving(true);
            setBanner(null);
              void onSave(provider, model, apiKey, baseUrl)
                .then(() => {
                  setBanner({
                    tone: "success",
                    message: "Provider saved successfully.",
                  });
                })
              .catch((err) => {
                setBanner({ tone: "error", message: formatProviderSaveError(err) });
                if (import.meta.env.DEV) {
                  console.error("[continuity] provider save failed");
                }
              })
              .finally(() => setSaving(false));
          }}
        >
          {saving ? "Saving…" : initial ? "Update provider" : "Save provider"}
        </button>
      </div>
    </div>
  );
}
