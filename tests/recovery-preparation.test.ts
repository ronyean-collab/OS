import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { openTestDatabase } from "../electron/main/database/test-db";
import { createWorkspace } from "../electron/main/services/workspace-service";
import {
  __resetEmbeddedLocalAiManagerForTests,
  prepareEmbeddedLocalAiOnFirstRun,
} from "../electron/main/services/embedded-local-ai-manager";
import {
  deriveAssistantPreparationStatus,
  shouldShowAssistantPreparationScreen,
} from "../src/shared/assistant-preparation-service";

describe("recovery preparation", () => {
  const cleanups: Array<() => void> = [];
  let userDataDir = "";

  afterEach(() => {
    __resetEmbeddedLocalAiManagerForTests();
    vi.unstubAllGlobals();
    if (userDataDir) fs.rmSync(userDataDir, { recursive: true, force: true });
    while (cleanups.length) cleanups.pop()?.();
  });

  it("resumes from persisted install state instead of restarting at zero", async () => {
    userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "continuity-recovery-"));
    vi.stubEnv("CONTINUITY_SKIP_RUNTIME_INSTALL", "1");
    fs.writeFileSync(
      path.join(userDataDir, "embedded-ai-install-state.json"),
      JSON.stringify(
        {
          model: "llama3.2:3b",
          baseUrl: "http://127.0.0.1:11434",
          phase: "downloading",
          progressPercent: 52,
          paused: false,
          error: null,
          bytesCompleted: 520,
          bytesTotal: 1000,
          updatedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
      "utf8",
    );

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );

    const { db, cleanup } = openTestDatabase();
    cleanups.push(cleanup);
    const ws = createWorkspace(db, "Recovery workspace");

    await prepareEmbeddedLocalAiOnFirstRun(db, ws.id, userDataDir);

    const status = deriveAssistantPreparationStatus({
      workspaceLoaded: true,
      embeddedPhase: "downloading",
      embeddedProgressPercent: 52,
      canReply: false,
    });

    expect(status.progressPercent).toBeGreaterThan(50);
    expect(status.stage).toBe("downloading_ai");
  });

  it("shows recovery preparation when assistant was ready before but is unavailable now", () => {
    expect(
      shouldShowAssistantPreparationScreen({
        recoveryMode: false,
        assistantPreparationCompleted: true,
        canReply: false,
        manualModeAccepted: false,
      }),
    ).toBe(true);
  });

  it("maps failures to consumer-friendly reasons", () => {
    const status = deriveAssistantPreparationStatus({
      workspaceLoaded: true,
      embeddedPhase: "offline_waiting",
      embeddedProgressPercent: null,
      canReply: false,
      offline: true,
    });

    expect(status.hasFailed).toBe(false);
    expect(status.preparationReason).toBe("NO_INTERNET");
    expect(status.reasonMessage.toLowerCase()).toContain("internet");
    expect(status.failureReason).toBeNull();
  });
});
