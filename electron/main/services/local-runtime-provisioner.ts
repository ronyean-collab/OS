import { execFile, spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { isExternalNetworkOffline } from "../../../src/shared/connectivity-failure";
import {
  OLLAMA_DEFAULT_BASE_URLS,
  OLLAMA_MANAGED_BASE_URL,
  buildOllamaProbeUrls,
} from "../../../src/shared/ollama-endpoints";
import { listOllamaModels } from "./local-ai-service";

const execFileAsync = promisify(execFile);

/** @deprecated Use OLLAMA_MANAGED_BASE_URL from ollama-endpoints */
export const MANAGED_OLLAMA_PORT = 11435;
export const MANAGED_OLLAMA_BASE_URL = OLLAMA_MANAGED_BASE_URL;

export type RuntimeProvisionPhase =
  | "idle"
  | "detecting"
  | "installing"
  | "starting"
  | "ready"
  | "failed"
  | "offline";

export type RuntimeProvisionProgress = {
  phase: RuntimeProvisionPhase;
  progressPercent: number | null;
  message: string;
};

export type RuntimeProvisionResult =
  | { ok: true; baseUrl: string }
  | { ok: false; error: string; offline?: boolean };

let managedProcess: ChildProcess | null = null;
let managedBaseUrl: string | null = null;
let testDelegate: ((userDataDir: string) => Promise<RuntimeProvisionResult>) | null = null;

const STARTUP_PROBE_ATTEMPTS =
  process.env.VITEST === "true" || process.env.NODE_ENV === "test" ? 2 : 30;
const STARTUP_PROBE_INTERVAL_MS = process.env.VITEST === "true" ? 50 : 1_000;
const RUNTIME_INSTALL_TIMEOUT_MS = 10 * 60_000;

function resolveManagedRuntimeDir(userDataDir: string): string {
  return path.join(userDataDir, "managed-runtime");
}

function resolveRuntimeStatePath(userDataDir: string): string {
  return path.join(resolveManagedRuntimeDir(userDataDir), "runtime-provision-state.json");
}

export function readRuntimeProvisionState(userDataDir: string): {
  lastError: string | null;
  lastPhase: RuntimeProvisionPhase;
} | null {
  const file = resolveRuntimeStatePath(userDataDir);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as {
      lastError: string | null;
      lastPhase: RuntimeProvisionPhase;
    };
  } catch {
    return null;
  }
}

function writeRuntimeProvisionState(
  userDataDir: string,
  partial: { lastError: string | null; lastPhase: RuntimeProvisionPhase },
): void {
  const dir = resolveManagedRuntimeDir(userDataDir);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(resolveRuntimeStatePath(userDataDir), JSON.stringify(partial, null, 2), "utf8");
}

export async function isRuntimeReachable(baseUrl: string): Promise<boolean> {
  try {
    await listOllamaModels(baseUrl);
    return true;
  } catch {
    return false;
  }
}

export async function discoverReachableOllamaBaseUrl(): Promise<string | null> {
  for (const baseUrl of buildOllamaProbeUrls()) {
    if (await isRuntimeReachable(baseUrl)) {
      return baseUrl;
    }
  }
  return null;
}

export async function findOllamaExecutable(): Promise<string | null> {
  const command = process.platform === "win32" ? "where" : "which";
  const args = process.platform === "win32" ? ["ollama"] : ["ollama"];
  try {
    const { stdout } = await execFileAsync(command, args, { timeout: 5_000 });
    const line = stdout
      .split(/\r?\n/)
      .map((value) => value.trim())
      .find(Boolean);
    if (line && fs.existsSync(line)) return line;
  } catch {
    // Fall through to common install paths.
  }

  const candidates =
    process.platform === "win32"
      ? [
          path.join(process.env.LOCALAPPDATA ?? "", "Programs", "Ollama", "ollama.exe"),
          path.join(process.env.ProgramFiles ?? "", "Ollama", "ollama.exe"),
        ]
      : process.platform === "darwin"
        ? [
            "/usr/local/bin/ollama",
            "/opt/homebrew/bin/ollama",
            path.join(osHome(), "Applications/Ollama.app/Contents/Resources/ollama"),
          ]
        : ["/usr/local/bin/ollama", "/usr/bin/ollama"];

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function osHome(): string {
  return process.env.HOME?.trim() || process.env.USERPROFILE?.trim() || "";
}

function parseOllamaHost(baseUrl: string): string {
  const url = new URL(baseUrl);
  const host = url.hostname === "localhost" ? "127.0.0.1" : url.hostname;
  const port = url.port || (url.protocol === "https:" ? "443" : "80");
  return `${host}:${port}`;
}

async function waitForRuntime(baseUrl: string): Promise<boolean> {
  for (let attempt = 0; attempt < STARTUP_PROBE_ATTEMPTS; attempt += 1) {
    if (await isRuntimeReachable(baseUrl)) return true;
    await new Promise((resolve) => setTimeout(resolve, STARTUP_PROBE_INTERVAL_MS));
  }
  return false;
}

async function ensureOllamaServeRunning(
  executable: string,
  baseUrl: string,
): Promise<{ ok: boolean; error?: string }> {
  if (await isRuntimeReachable(baseUrl)) {
    return { ok: true };
  }

  const ollamaHost = parseOllamaHost(baseUrl);
  try {
    if (managedProcess && !managedProcess.killed) {
      managedProcess.kill();
    }
    managedProcess = spawn(executable, ["serve"], {
      detached: process.platform !== "win32",
      stdio: "ignore",
      env: {
        ...process.env,
        OLLAMA_HOST: ollamaHost,
      },
    });
    managedProcess.unref?.();
    managedBaseUrl = baseUrl;
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not start local AI runtime.",
    };
  }

  const ready = await waitForRuntime(baseUrl);
  if (!ready) {
    const port = new URL(baseUrl).port || "11434";
    return {
      ok: false,
      error: `Local AI could not start because port ${port} is unavailable.`,
    };
  }
  return { ok: true };
}

async function installOllamaWindows(userDataDir: string): Promise<RuntimeProvisionResult> {
  const runtimeDir = resolveManagedRuntimeDir(userDataDir);
  fs.mkdirSync(runtimeDir, { recursive: true });
  const installerPath = path.join(runtimeDir, "OllamaSetup.exe");

  try {
    const response = await fetch("https://ollama.com/download/OllamaSetup.exe", {
      signal: AbortSignal.timeout(RUNTIME_INSTALL_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`Runtime download failed (HTTP ${response.status}).`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(installerPath, buffer);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Runtime download failed.",
      offline: isExternalNetworkOffline(error, {
        targetUrl: "https://ollama.com/download/OllamaSetup.exe",
      }),
    };
  }

  try {
    await execFileAsync(installerPath, ["/VERYSILENT", "/NORESTART"], {
      timeout: RUNTIME_INSTALL_TIMEOUT_MS,
    });
    return { ok: true, baseUrl: OLLAMA_MANAGED_BASE_URL };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Runtime installation failed.",
      offline: false,
    };
  }
}

async function installOllamaUnix(): Promise<RuntimeProvisionResult> {
  try {
    await execFileAsync(
      "sh",
      ["-c", "curl -fsSL https://ollama.com/install.sh | sh"],
      { timeout: RUNTIME_INSTALL_TIMEOUT_MS },
    );
    return { ok: true, baseUrl: OLLAMA_MANAGED_BASE_URL };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Runtime installation failed.",
      offline: isExternalNetworkOffline(error, {
        targetUrl: "https://ollama.com/install.sh",
      }),
    };
  }
}

async function installOllamaRuntime(userDataDir: string): Promise<RuntimeProvisionResult> {
  if (process.env.CONTINUITY_SKIP_RUNTIME_INSTALL === "1") {
    return {
      ok: false,
      error: "Local AI runtime installation is disabled in this environment.",
      offline: true,
    };
  }

  if (process.platform === "win32") {
    return installOllamaWindows(userDataDir);
  }
  if (process.platform === "darwin" || process.platform === "linux") {
    return installOllamaUnix();
  }
  return { ok: false, error: "Local AI runtime is not supported on this platform yet." };
}

function resolveStubResultSync(): RuntimeProvisionResult | null {
  const stub = process.env.CONTINUITY_RUNTIME_PROVISION_STUB?.trim();
  if (!stub) return null;
  if (stub === "ready") {
    const baseUrl =
      process.env.CONTINUITY_MANAGED_RUNTIME_URL?.trim() || OLLAMA_DEFAULT_BASE_URLS[0];
    return { ok: true, baseUrl };
  }
  if (stub === "offline") {
    return { ok: false, error: "Offline (test stub).", offline: true };
  }
  return { ok: false, error: "Runtime provision failed (test stub)." };
}

/**
 * Ensure a reachable local AI runtime exists — detect, install, or start as needed.
 * Port priority: existing Ollama on 11434 → managed 11435 → install → start.
 */
export async function provisionLocalRuntime(
  userDataDir: string,
  onProgress?: (progress: RuntimeProvisionProgress) => void,
): Promise<RuntimeProvisionResult> {
  if (testDelegate) {
    return testDelegate(userDataDir);
  }

  const stub = resolveStubResultSync();
  if (stub) return stub;

  const skipInstall = process.env.CONTINUITY_SKIP_RUNTIME_INSTALL === "1";

  const emit = (progress: RuntimeProvisionProgress) => {
    writeRuntimeProvisionState(userDataDir, {
      lastError: progress.phase === "failed" ? progress.message : null,
      lastPhase: progress.phase,
    });
    onProgress?.(progress);
  };

  emit({
    phase: "detecting",
    progressPercent: 8,
    message: "Checking local AI runtime…",
  });

  const existing = await discoverReachableOllamaBaseUrl();
  if (existing) {
    emit({ phase: "ready", progressPercent: 100, message: "Local AI runtime is ready." });
    return { ok: true, baseUrl: existing };
  }

  if (skipInstall) {
    const skipped: RuntimeProvisionResult = {
      ok: false,
      error: "Local AI runtime installation is disabled in this environment.",
      offline: true,
    };
    emit({ phase: "offline", progressPercent: null, message: skipped.error });
    return skipped;
  }

  const existingExecutable = await findOllamaExecutable();
  if (existingExecutable) {
    let lastStartError = "Local AI runtime did not start.";
    for (const baseUrl of buildOllamaProbeUrls()) {
      emit({
        phase: "starting",
        progressPercent: 55,
        message: "Starting local AI…",
      });
      const started = await ensureOllamaServeRunning(existingExecutable, baseUrl);
      if (started.ok) {
        emit({ phase: "ready", progressPercent: 100, message: "Local AI runtime is ready." });
        return { ok: true, baseUrl };
      }
      lastStartError = started.error ?? lastStartError;
    }
    void lastStartError;
  }

  emit({
    phase: "installing",
    progressPercent: 22,
    message: "Local AI is not installed yet. ContinuityOS is preparing it now.",
  });
  const installed = await installOllamaRuntime(userDataDir);
  if (!installed.ok) {
    emit({
      phase: installed.offline ? "offline" : "failed",
      progressPercent: null,
      message: installed.error,
    });
    return installed;
  }

  emit({
    phase: "starting",
    progressPercent: 72,
    message: "Starting local AI…",
  });

  const executable = (await findOllamaExecutable()) ?? existingExecutable;
  if (!executable) {
    const missing: RuntimeProvisionResult = {
      ok: false,
      error: "Local AI runtime was installed but could not be located.",
    };
    emit({ phase: "failed", progressPercent: null, message: missing.error });
    return missing;
  }

  const started = await ensureOllamaServeRunning(executable, installed.baseUrl);
  if (!started.ok) {
    const failed: RuntimeProvisionResult = {
      ok: false,
      error: started.error ?? "Local AI runtime did not start.",
    };
    emit({ phase: "failed", progressPercent: null, message: failed.error });
    return failed;
  }

  emit({ phase: "ready", progressPercent: 100, message: "Local AI runtime is ready." });
  return { ok: true, baseUrl: installed.baseUrl };
}

export function stopManagedRuntime(): void {
  if (managedProcess && !managedProcess.killed) {
    managedProcess.kill();
  }
  managedProcess = null;
  managedBaseUrl = null;
}

export function __setRuntimeProvisionerDelegateForTests(
  delegate: ((userDataDir: string) => Promise<RuntimeProvisionResult>) | null,
): void {
  testDelegate = delegate;
}

export function __resetRuntimeProvisionerForTests(): void {
  testDelegate = null;
  stopManagedRuntime();
}
