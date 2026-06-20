import fs from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import type { LocalAiStatus } from "../../../src/shared/types";
import { resolveDefaultLocalModel } from "../../../src/shared/default-ai-config";
import {
  EMBEDDED_AI_ALMOST_READY_LABEL,
  EMBEDDED_AI_CHAT_WHILE_PREPARING,
  EMBEDDED_AI_OFFLINE_MESSAGE,
  EMBEDDED_AI_PREPARING_HEADLINE,
  EMBEDDED_AI_READY_MESSAGE,
  mapPhaseToConsumerDetail,
  mapPhaseToConsumerLabel,
  type EmbeddedAiConsumerStatus,
  type EmbeddedAiInstallPhase,
  type EmbeddedAiInstallProgress,
} from "../../../src/shared/embedded-local-ai-consumer";
import { __resetLocalAiServiceForTests, getLocalAiStatus, listOllamaModels } from "./local-ai-service";
import { bootstrapLocalAiOnStartup } from "./local-ai-bootstrap";
import { saveProviderConfig } from "./provider-service";
import { testProviderConnection } from "./provider-connection-test";
import {
  isExternalNetworkOffline,
  isLocalRuntimeUnreachable,
} from "../../../src/shared/connectivity-failure";
import {
  provisionLocalRuntime,
  type RuntimeProvisionPhase,
  __resetRuntimeProvisionerForTests,
} from "./local-runtime-provisioner";
import { writeOllamaStartupDiagnosticFile } from "./ollama-startup-diagnostic";

type PersistedInstallState = {
  model: string;
  baseUrl: string | null;
  phase: EmbeddedAiInstallPhase;
  progressPercent: number | null;
  paused: boolean;
  error: string | null;
  /** True only when an external network fetch failed — not local ECONNREFUSED. */
  networkOffline?: boolean;
  bytesCompleted: number;
  bytesTotal: number;
  updatedAt: string;
};

type RuntimeSnapshot = {
  phase: EmbeddedAiInstallPhase;
  progressPercent: number | null;
  paused: boolean;
  error: string | null;
  baseUrl: string | null;
  model: string;
  offline: boolean;
  aiRepliesReady: boolean;
};

let installState: PersistedInstallState | null = null;
let activePullAbort: AbortController | null = null;
let prepareInFlight: Promise<void> | null = null;
let progressListeners: Array<(progress: EmbeddedAiInstallProgress) => void> = [];

function defaultModel(): string {
  return resolveDefaultLocalModel();
}

function resolveStatePath(userDataDir: string): string {
  return path.join(userDataDir, "embedded-ai-install-state.json");
}

function normalizePersistedState(raw: PersistedInstallState): PersistedInstallState {
  if (
    raw.phase === "offline_waiting" &&
    raw.networkOffline !== true &&
    raw.error &&
    isLocalRuntimeUnreachable(raw.error, { targetUrl: raw.baseUrl })
  ) {
    return {
      ...raw,
      phase: "failed",
      networkOffline: false,
    };
  }
  return {
    ...raw,
    networkOffline: raw.networkOffline ?? raw.phase === "offline_waiting",
  };
}

function loadPersistedState(userDataDir: string): PersistedInstallState | null {
  const file = resolveStatePath(userDataDir);
  if (!fs.existsSync(file)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as PersistedInstallState;
    if (raw?.model && raw?.phase) return normalizePersistedState(raw);
  } catch {
    // Corrupt state — start fresh.
  }
  return null;
}

function persistState(userDataDir: string, state: PersistedInstallState): void {
  installState = state;
  const file = resolveStatePath(userDataDir);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(state, null, 2), "utf8");
}

function emitProgress(state: PersistedInstallState): void {
  const progress: EmbeddedAiInstallProgress = {
    phase: state.phase,
    progressPercent: state.progressPercent,
    consumerLabel: mapPhaseToConsumerDetail(state.phase, state.phase === "offline_waiting"),
    consumerDetail: mapPhaseToConsumerDetail(state.phase, state.phase === "offline_waiting"),
  };
  for (const listener of progressListeners) listener(progress);
}

function mapProvisionerPhaseToEmbedded(phase: RuntimeProvisionPhase): EmbeddedAiInstallPhase {
  switch (phase) {
    case "installing":
      return "installing_runtime";
    case "starting":
      return "starting_runtime";
    case "detecting":
      return "checking";
    case "ready":
      return "preparing";
    case "offline":
      return "offline_waiting";
    case "failed":
      return "failed";
    default:
      return "checking";
  }
}

function mapProvisionerProgress(phase: RuntimeProvisionPhase): number | null {
  switch (phase) {
    case "installing":
      return 18;
    case "starting":
      return 42;
    case "detecting":
      return 10;
    case "ready":
      return 50;
    default:
      return null;
  }
}

async function ensureRuntimeAvailable(
  db: Database.Database,
  workspaceId: string,
  userDataDir: string,
  model: string,
): Promise<{ ok: true; baseUrl: string } | { ok: false; offline?: boolean; error: string }> {
  const localStatus = await getLocalAiStatus(db, workspaceId);
  if (localStatus.detected && localStatus.baseUrl) {
    return { ok: true, baseUrl: localStatus.baseUrl };
  }

  const provisioned = await provisionLocalRuntime(userDataDir, (progress) => {
    const next: PersistedInstallState = {
      model,
      baseUrl: installState?.baseUrl ?? null,
      phase: mapProvisionerPhaseToEmbedded(progress.phase),
      progressPercent: progress.progressPercent ?? mapProvisionerProgress(progress.phase),
      paused: false,
      error: progress.phase === "failed" || progress.phase === "offline" ? progress.message : null,
      bytesCompleted: 0,
      bytesTotal: 0,
      updatedAt: new Date().toISOString(),
    };
    persistState(userDataDir, next);
    emitProgress(next);
  });

  if (!provisioned.ok) {
    return {
      ok: false,
      offline: provisioned.offline,
      error: provisioned.error,
    };
  }

  const afterProvision = await getLocalAiStatus(db, workspaceId, provisioned.baseUrl);
  if (afterProvision.detected && afterProvision.baseUrl) {
    return { ok: true, baseUrl: afterProvision.baseUrl };
  }

  if (await checkModelInstalled(provisioned.baseUrl, model)) {
    return { ok: true, baseUrl: provisioned.baseUrl };
  }

  const reachable = await listOllamaModels(provisioned.baseUrl).then(
    () => true,
    () => false,
  );
  if (reachable) {
    return { ok: true, baseUrl: provisioned.baseUrl };
  }

  return {
    ok: false,
    error: "Local AI runtime is not reachable after provisioning.",
  };
}

function modelMatchesAvailable(model: string, available: string[]): boolean {
  const trimmed = model.trim();
  if (available.includes(trimmed)) return true;
  const base = trimmed.split(":")[0];
  return available.some((name) => name === base || name.startsWith(`${base}:`));
}

export async function checkModelInstalled(
  baseUrl: string,
  model: string = defaultModel(),
): Promise<boolean> {
  try {
    const models = await listOllamaModels(baseUrl);
    return modelMatchesAvailable(model, models);
  } catch {
    return false;
  }
}

export async function checkLocalAiReady(
  db: Database.Database,
  workspaceId: string,
): Promise<{ ready: boolean; localStatus: LocalAiStatus; model: string }> {
  const model = defaultModel();
  const localStatus = await getLocalAiStatus(db, workspaceId);
  const ready =
    localStatus.state === "ollama_ready" &&
    localStatus.models.length > 0 &&
    modelMatchesAvailable(model, localStatus.models);
  return { ready, localStatus, model };
}

export function getInstallProgress(): EmbeddedAiInstallProgress | null {
  if (!installState) return null;
  return {
    phase: installState.phase,
    progressPercent: installState.progressPercent,
    consumerLabel: mapPhaseToConsumerDetail(
      installState.phase,
      installState.phase === "offline_waiting",
    ),
    consumerDetail: mapPhaseToConsumerDetail(
      installState.phase,
      installState.phase === "offline_waiting",
    ),
  };
}

export function getRuntimeStatus(): RuntimeSnapshot {
  const model = defaultModel();
  if (!installState) {
    return {
      phase: "idle",
      progressPercent: null,
      paused: false,
      error: null,
      baseUrl: null,
      model,
      offline: false,
      aiRepliesReady: false,
    };
  }
  return {
    phase: installState.phase,
    progressPercent: installState.progressPercent,
    paused: installState.paused,
    error: installState.error,
    baseUrl: installState.baseUrl,
    model: installState.model,
    offline: Boolean(installState.networkOffline),
    aiRepliesReady: installState.phase === "ready",
  };
}

export function getConsumerStatus(): EmbeddedAiConsumerStatus {
  const runtime = getRuntimeStatus();
  const label = mapPhaseToConsumerLabel(runtime.phase);
  const detail = mapPhaseToConsumerDetail(runtime.phase, runtime.offline);
  const message =
    runtime.phase === "ready"
      ? EMBEDDED_AI_READY_MESSAGE
      : runtime.phase === "offline_waiting" && runtime.offline
        ? EMBEDDED_AI_OFFLINE_MESSAGE
        : runtime.phase === "preparing" || runtime.phase === "checking"
          ? EMBEDDED_AI_ALMOST_READY_LABEL
          : EMBEDDED_AI_PREPARING_HEADLINE;

  return {
    label,
    message,
    detail,
    phase: runtime.phase,
    progressPercent: runtime.progressPercent,
    bytesDownloaded: installState?.bytesCompleted ?? null,
    bytesTotal: installState?.bytesTotal ?? null,
    lastProgressAt: installState?.updatedAt ?? null,
    canChat: runtime.aiRepliesReady,
    aiRepliesReady: runtime.aiRepliesReady,
    chatWhilePreparingMessage: EMBEDDED_AI_CHAT_WHILE_PREPARING,
    offline: runtime.offline,
    paused: runtime.paused,
    lastError: runtime.error,
    baseUrl: runtime.baseUrl,
  };
}

export function subscribeEmbeddedAiProgress(
  listener: (progress: EmbeddedAiInstallProgress) => void,
): () => void {
  progressListeners.push(listener);
  return () => {
    progressListeners = progressListeners.filter((item) => item !== listener);
  };
}

async function pullModelWithProgress(
  baseUrl: string,
  model: string,
  userDataDir: string,
): Promise<void> {
  const url = `${baseUrl.replace(/\/$/, "")}/api/pull`;
  activePullAbort = new AbortController();

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: model, stream: true }),
    signal: activePullAbort.signal,
  });

  if (!response.ok || !response.body) {
    throw new Error(`Pull failed with HTTP ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      let event: {
        status?: string;
        total?: number;
        completed?: number;
      };
      try {
        event = JSON.parse(line) as typeof event;
      } catch {
        continue;
      }

      if (installState?.paused) {
        activePullAbort?.abort();
        return;
      }

      const status = event.status ?? "";
      if (status === "success") {
        const next: PersistedInstallState = {
          ...installState!,
          phase: "preparing",
          progressPercent: 95,
          error: null,
          updatedAt: new Date().toISOString(),
        };
        persistState(userDataDir, next);
        emitProgress(next);
        return;
      }

      if (status === "downloading" && event.total && event.completed != null) {
        const pct = Math.min(90, Math.round((event.completed / event.total) * 90));
        const next: PersistedInstallState = {
          ...installState!,
          phase: "downloading",
          progressPercent: pct,
          bytesCompleted: event.completed,
          bytesTotal: event.total,
          error: null,
          updatedAt: new Date().toISOString(),
        };
        persistState(userDataDir, next);
        emitProgress(next);
      } else if (status === "pulling manifest" || status === "verifying sha256") {
        const next: PersistedInstallState = {
          ...installState!,
          phase: "downloading",
          progressPercent: installState?.progressPercent ?? 5,
          error: null,
          updatedAt: new Date().toISOString(),
        };
        persistState(userDataDir, next);
        emitProgress(next);
      }
    }
  }
}

async function activateLocalAi(
  db: Database.Database,
  workspaceId: string,
  baseUrl: string,
  model: string,
  userDataDir: string,
): Promise<void> {
  saveProviderConfig(db, workspaceId, "ollama", model, "", baseUrl);
  await bootstrapLocalAiOnStartup(db, workspaceId);

  const tested = await testProviderConnection(db, workspaceId, {
    provider: "ollama",
    model,
    baseUrl,
  });

  if (!tested.ok) {
    const failed: PersistedInstallState = {
      model,
      baseUrl,
      phase: "failed",
      progressPercent: null,
      paused: false,
      error: tested.message,
      bytesCompleted: 0,
      bytesTotal: 0,
      updatedAt: new Date().toISOString(),
    };
    persistState(userDataDir, failed);
    emitProgress(failed);
    return;
  }

  const next: PersistedInstallState = {
    model,
    baseUrl,
    phase: "ready",
    progressPercent: 100,
    paused: false,
    error: null,
    bytesCompleted: 0,
    bytesTotal: 0,
    updatedAt: new Date().toISOString(),
  };
  persistState(userDataDir, next);
  emitProgress(next);
}

export async function startLocalRuntime(
  db: Database.Database,
  workspaceId: string,
  _userDataDir: string,
): Promise<LocalAiStatus> {
  return bootstrapLocalAiOnStartup(db, workspaceId);
}

export async function downloadDefaultModel(
  db: Database.Database,
  workspaceId: string,
  userDataDir: string,
  baseUrl: string,
): Promise<void> {
  const model = defaultModel();
  if (installState?.paused) return;

  const next: PersistedInstallState = {
    model,
    baseUrl,
    phase: "downloading",
    progressPercent: 0,
    paused: false,
    error: null,
    bytesCompleted: 0,
    bytesTotal: 0,
    updatedAt: new Date().toISOString(),
  };
  persistState(userDataDir, next);
  emitProgress(next);

  try {
    await pullModelWithProgress(baseUrl, model, userDataDir);
    if (installState?.paused) return;

    const preparing: PersistedInstallState = {
      ...installState!,
      phase: "preparing",
      progressPercent: 98,
      updatedAt: new Date().toISOString(),
    };
    persistState(userDataDir, preparing);
    emitProgress(preparing);

    await activateLocalAi(db, workspaceId, baseUrl, model, userDataDir);
  } catch (error) {
    if (installState?.paused) return;
    const targetUrl = baseUrl;
    const externalOffline = isExternalNetworkOffline(error, { targetUrl });
    const failed: PersistedInstallState = {
      ...(installState ?? next),
      phase: externalOffline ? "offline_waiting" : "failed",
      networkOffline: externalOffline,
      error: error instanceof Error ? error.message : String(error),
      updatedAt: new Date().toISOString(),
    };
    persistState(userDataDir, failed);
    emitProgress(failed);
  } finally {
    activePullAbort = null;
  }
}

/** First-run preparation — no wizard, no blocking dialog. */
export async function prepareEmbeddedLocalAiOnFirstRun(
  db: Database.Database,
  workspaceId: string,
  userDataDir: string,
): Promise<EmbeddedAiConsumerStatus> {
  if (prepareInFlight) {
    await prepareInFlight.catch(() => undefined);
    return getConsumerStatus();
  }

  prepareInFlight = (async () => {
    const model = defaultModel();
    const restored = loadPersistedState(userDataDir);
    if (restored) {
      installState = restored;
      if (restored.phase === "ready" && restored.baseUrl) {
        await activateLocalAi(db, workspaceId, restored.baseUrl, model, userDataDir);
        return;
      }
      if (
        restored.phase === "downloading" &&
        restored.baseUrl &&
        !restored.paused
      ) {
        await downloadDefaultModel(db, workspaceId, userDataDir, restored.baseUrl);
        return;
      }
      if (
        (restored.phase === "offline_waiting" || restored.phase === "failed") &&
        restored.baseUrl &&
        !restored.paused
      ) {
        await downloadDefaultModel(db, workspaceId, userDataDir, restored.baseUrl);
        return;
      }
    }

    const checking: PersistedInstallState = {
      model,
      baseUrl: restored?.baseUrl ?? null,
      phase: "checking",
      progressPercent: null,
      paused: restored?.paused ?? false,
      error: null,
      bytesCompleted: 0,
      bytesTotal: 0,
      updatedAt: new Date().toISOString(),
    };
    persistState(userDataDir, checking);
    emitProgress(checking);

    const { ready, localStatus } = await checkLocalAiReady(db, workspaceId);
    if (ready && localStatus.baseUrl) {
      await activateLocalAi(db, workspaceId, localStatus.baseUrl, model, userDataDir);
      return;
    }

    if (localStatus.detected && localStatus.baseUrl) {
      const hasModel = modelMatchesAvailable(model, localStatus.models);
      if (hasModel) {
        await activateLocalAi(db, workspaceId, localStatus.baseUrl, model, userDataDir);
        return;
      }
      if (!installState?.paused) {
        await downloadDefaultModel(db, workspaceId, userDataDir, localStatus.baseUrl);
      }
      return;
    }

    const runtime = await ensureRuntimeAvailable(db, workspaceId, userDataDir, model);
    if (!runtime.ok) {
      const failed: PersistedInstallState = {
        model,
        baseUrl: installState?.baseUrl ?? null,
        phase: runtime.offline ? "offline_waiting" : "failed",
        networkOffline: runtime.offline,
        progressPercent: null,
        paused: false,
        error: runtime.error,
        bytesCompleted: 0,
        bytesTotal: 0,
        updatedAt: new Date().toISOString(),
      };
      persistState(userDataDir, failed);
      emitProgress(failed);
      return;
    }

    const provisionedStatus = await getLocalAiStatus(db, workspaceId, runtime.baseUrl);
    const hasModel = modelMatchesAvailable(model, provisionedStatus.models);
    if (hasModel) {
      await activateLocalAi(db, workspaceId, runtime.baseUrl, model, userDataDir);
      return;
    }

    if (!installState?.paused) {
      await downloadDefaultModel(db, workspaceId, userDataDir, runtime.baseUrl);
    }
  })();

  try {
    await prepareInFlight;
  } finally {
    prepareInFlight = null;
  }

  if (process.env.CONTINUITY_WRITE_OLLAMA_DIAGNOSTIC === "1") {
    try {
      const repoRoot = path.resolve(process.cwd());
      void writeOllamaStartupDiagnosticFile(repoRoot);
    } catch {
      // Non-blocking diagnostic export.
    }
  }

  return getConsumerStatus();
}

export function pauseEmbeddedLocalAiDownload(userDataDir: string): EmbeddedAiConsumerStatus {
  if (installState) {
    installState = { ...installState, paused: true, phase: "paused", updatedAt: new Date().toISOString() };
    persistState(userDataDir, installState);
    activePullAbort?.abort();
    emitProgress(installState);
  }
  return getConsumerStatus();
}

export function resumeEmbeddedLocalAiDownload(userDataDir: string): EmbeddedAiConsumerStatus {
  if (installState?.paused) {
    installState = {
      ...installState,
      paused: false,
      phase: "downloading",
      updatedAt: new Date().toISOString(),
    };
    persistState(userDataDir, installState);
    emitProgress(installState);
  }
  return getConsumerStatus();
}

export async function restartEmbeddedLocalAiDownload(
  db: Database.Database,
  workspaceId: string,
  userDataDir: string,
): Promise<EmbeddedAiConsumerStatus> {
  activePullAbort?.abort();
  installState = null;
  const file = resolveStatePath(userDataDir);
  if (fs.existsSync(file)) {
    fs.unlinkSync(file);
  }
  return prepareEmbeddedLocalAiOnFirstRun(db, workspaceId, userDataDir);
}

export function __resetEmbeddedLocalAiManagerForTests(): void {
  installState = null;
  activePullAbort?.abort();
  activePullAbort = null;
  prepareInFlight = null;
  progressListeners = [];
  __resetRuntimeProvisionerForTests();
  __resetLocalAiServiceForTests();
}
