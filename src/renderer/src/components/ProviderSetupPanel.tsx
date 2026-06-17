import { useEffect, useRef, useState } from "react";

import type { LocalAiStatus, ProviderConfig, ProviderTestResult, EmbeddedAiConsumerStatus } from "@shared/types";

import { formatProviderSaveError } from "@shared/provider-errors";

import { getProviderDefinition } from "@shared/provider-definitions";

import {

  AI_UNAVAILABLE_MESSAGE,

  LOCAL_AI_ADVANCED_HEADING,

  LOCAL_AI_CONTINUE_TO_CHAT,

  LOCAL_AI_CONTINUE_WITHOUT,

  LOCAL_AI_NOT_READY,

  LOCAL_AI_SKIP_FOR_NOW,

  LOCAL_AI_TRY_AGAIN,

} from "@shared/consumer-experience-copy";

import { deriveLocalAiCardState } from "@shared/local-ai-card-state";



export type ProviderSetupPanelProps = {

  workspaceId: string;

  initial: ProviderConfig | null;

  initialProviderId?: string;

  focusLocalAiSignal?: number;

  embeddedAiConsumerStatus?: EmbeddedAiConsumerStatus | null;

  canReply?: boolean;

  onBackToChat?: () => void;

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

  embeddedAiConsumerStatus = null,

  canReply = false,

  onBackToChat,

  onSave,

  onTest,

  onOpenUrl,

}: ProviderSetupPanelProps) {

  const localDef = getProviderDefinition("ollama");

  const [localModel, setLocalModel] = useState(

    initial?.provider === "ollama" ? initial.model : localDef.recommendedModel,

  );

  const [baseUrl, setBaseUrl] = useState(

    initial?.provider === "ollama"

      ? initial.baseUrl ?? localDef.defaultBaseUrl ?? ""

      : localDef.defaultBaseUrl ?? "",

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

  const cardState = deriveLocalAiCardState({
    canReply,
    embedded: embeddedAiConsumerStatus,
    localAiStatus,
    lastTest,
  });

  const statusLabel = cardState.statusPill;



  const runTest = async () => {

    setTesting(true);

    setBanner(null);

    setLastTest(null);

    try {

      const result = await onTest("ollama", localModel, "", baseUrl);

      setLastTest(result);

      setBanner({

        tone: result.ok ? "success" : "error",

        message: result.ok ? cardState.headline : AI_UNAVAILABLE_MESSAGE,

      });

    } catch (err) {

      const message =

        err instanceof Error ? err.message : "Connection test could not complete.";

      setBanner({ tone: "error", message: AI_UNAVAILABLE_MESSAGE });

      if (import.meta.env.DEV) {

        console.error("[continuity] provider test failed", { provider: "ollama" });

      }

    } finally {

      setTesting(false);

    }

  };



  const useLocalAi = async () => {

    setSaving(true);

    setBanner(null);

    try {

      const nextBaseUrl = baseUrl.trim() || localAiStatus?.baseUrl || localDef.defaultBaseUrl || "";

      if (!nextBaseUrl) {

        throw new Error("Polaris local address is required.");

      }

      await onSave("ollama", localModel, "", nextBaseUrl);

      setBanner({

        tone: "success",

        message: cardState.headline,

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

        Polaris runs locally on your computer when available. Setup stays focused on the built-in local assistant.

        Your conversations and memory stay on this device either way.

      </p>



      <section

        ref={localAiPanelRef}

        className={`local-ai-panel${highlightLocalAi ? " is-highlighted" : ""}`}

        aria-label="Polaris Local Engine"

        data-testid="local-ai-setup-panel"

      >

        <div className="local-ai-panel-header">

          <div>

            <h3 data-testid="local-ai-card-headline">{cardState.headline}</h3>

            <p className="muted small">Built-in Polaris — no account setup required.</p>

          </div>

          <span

            className={

              statusLabel === "Ready"
                ? "provider-pill ready"
                : statusLabel === "Needs attention"
                  ? "provider-pill warn"
                  : "provider-pill"

            }

            data-testid="local-ai-status-pill"

          >

            {statusLabel}

          </span>

        </div>

        <p className="muted small" data-testid="local-ai-status-message">
          {cardState.detail ?? localAiStatus?.message ?? LOCAL_AI_NOT_READY}
        </p>

        {cardState.progressPercent != null && (
          <p className="muted small" data-testid="settings-embedded-ai-progress">
            {cardState.progressPercent}%
          </p>
        )}



        <label>

          Model

          <select

            value={localModel}

            onChange={(e) => setLocalModel(e.target.value)}

            disabled={loadingLocalAi || (localAiStatus?.models.length ?? 0) === 0}

            data-testid="local-ai-model-select"

          >

            {(localAiStatus?.models.length ? localAiStatus.models : [localDef.recommendedModel]).map(

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

            data-testid="local-ai-retry"

          >

            {loadingLocalAi ? "Checking..." : LOCAL_AI_TRY_AGAIN}

          </button>

          <button

            type="button"

            className="secondary"

            disabled={testing || !localModel || !canTest}

            onClick={() => void runTest()}

          >

            {testing ? "Testing..." : "Test connection"}

          </button>

          <button

            type="button"

            disabled={saving || !canSave}

            onClick={() => void useLocalAi()}

            data-testid="local-ai-use-for-chat"

          >

            {saving ? "Saving..." : "Use for chat"}

          </button>

        </div>



        {onBackToChat && (

          <div className="provider-tab-actions provider-setup-escape">

            <button

              type="button"

              className="secondary small-btn"

              onClick={onBackToChat}

              data-testid="local-ai-skip-for-now"

            >

              {LOCAL_AI_SKIP_FOR_NOW}

            </button>

            <button

              type="button"

              className="secondary small-btn"

              onClick={onBackToChat}

              data-testid="local-ai-continue-to-chat"

            >

              {LOCAL_AI_CONTINUE_TO_CHAT}

            </button>

            <button

              type="button"

              className="secondary small-btn"

              onClick={onBackToChat}

              data-testid="local-ai-continue-without"

            >

              {LOCAL_AI_CONTINUE_WITHOUT}

            </button>

          </div>

        )}



        <details className="provider-advanced-details" data-testid="local-ai-advanced">

          <summary>{LOCAL_AI_ADVANCED_HEADING}</summary>

          <div className="local-ai-stats">

            <span>

              Workspace: <span className="mono">{workspaceId.slice(0, 8)}...</span>

            </span>

            <span>

              Connection:{" "}

              <span className="mono">

                {localAiStatus?.baseUrl ?? localDef.defaultBaseUrl ?? "local default"}

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

            Polaris local address (advanced)

            <input

              value={baseUrl}

              onChange={(e) => {

                setBaseUrl(e.target.value);

                setBanner(null);

              }}

              placeholder={localDef.defaultBaseUrl ?? "local address"}

              data-testid="local-ai-base-url"

            />

          </label>

          {localDef.docsUrl && (

            <button

              type="button"

              className="secondary small-btn"

              onClick={() => onOpenUrl(localDef.docsUrl!)}

            >

              Polaris help (advanced)

            </button>

          )}

          <p className="muted small">{localDef.privacyNote}</p>

        </details>

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





