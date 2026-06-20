import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openTestDatabase } from "../electron/main/database/test-db";
import { createWorkspace } from "../electron/main/services/workspace-service";
import {
  __resetEmbeddedLocalAiManagerForTests,
  getConsumerStatus,
  prepareEmbeddedLocalAiOnFirstRun,
  restartEmbeddedLocalAiDownload,
} from "../electron/main/services/embedded-local-ai-manager";
import { __setLocalAiStatusDelegateForTests } from "../electron/main/services/local-ai-service";
import { shouldShowAssistantPreparationScreen } from "../src/shared/assistant-preparation-service";
import { chatSendAllowed, resolveStartupView } from "../src/shared/startup-flow";
import type { AppState } from "../src/shared/types";

describe("fresh install without local AI", () => {
  const cleanups: Array<() => void> = [];
  let userDataDir = "";

  beforeEach(() => {
    vi.stubEnv("CONTINUITY_SKIP_RUNTIME_INSTALL", "1");
    __setLocalAiStatusDelegateForTests(async () => ({
      state: "ollama_not_running",
      message: "Local AI is unavailable.",
      detected: false,
      baseUrl: "http://127.0.0.1:9",
      models: [],
      selectedModel: null,
    }));
  });
  afterEach(() => {
    __resetEmbeddedLocalAiManagerForTests();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    if (userDataDir) fs.rmSync(userDataDir, { recursive: true, force: true });
    while (cleanups.length) cleanups.pop()?.();
  });

  it("shows preparation before chat on first launch", async () => {
    userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "continuity-fresh-"));
    vi.stubEnv("CONTINUITY_SKIP_RUNTIME_INSTALL", "1");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );

    const { db, cleanup } = openTestDatabase();
    cleanups.push(cleanup);
    const ws = createWorkspace(db, "Fresh install");

    const status = await prepareEmbeddedLocalAiOnFirstRun(db, ws.id, userDataDir);
    expect(status.canChat).toBe(false);
    expect(status.aiRepliesReady).toBe(false);
    expect(status.phase).toBe("offline_waiting");
    expect(status.message.toLowerCase()).not.toContain("ollama");
    expect(status.message.toLowerCase()).not.toContain("localhost");

    expect(
      shouldShowAssistantPreparationScreen({
        recoveryMode: false,
        assistantPreparationCompleted: false,
        canReply: false,
        manualModeAccepted: false,
      }),
    ).toBe(true);

    const appState = {
      recoveryMode: false,
    } as AppState;
    expect(resolveStartupView({ loading: false, appState })).toBe("chat");
    expect(chatSendAllowed(appState)).toBe(true);
    expect(getConsumerStatus().canChat).toBe(false);
  });

  it("can restart preparation after failure", async () => {
    userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "continuity-fresh-retry-"));
    vi.stubEnv("CONTINUITY_SKIP_RUNTIME_INSTALL", "1");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );

    const { db, cleanup } = openTestDatabase();
    cleanups.push(cleanup);
    const ws = createWorkspace(db, "Fresh retry");

    await prepareEmbeddedLocalAiOnFirstRun(db, ws.id, userDataDir);
    const retried = await restartEmbeddedLocalAiDownload(db, ws.id, userDataDir);
    expect(retried.aiRepliesReady).toBe(false);
    expect(["failed", "offline_waiting", "checking", "installing_runtime"]).toContain(
      retried.phase,
    );
  });
});
