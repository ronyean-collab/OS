import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { openTestDatabase } from "../electron/main/database/test-db";
import { createWorkspace } from "../electron/main/services/workspace-service";
import { getProviderConfig } from "../electron/main/services/provider-service";
import {
  __resetEmbeddedLocalAiManagerForTests,
  prepareEmbeddedLocalAiOnFirstRun,
} from "../electron/main/services/embedded-local-ai-manager";
import { resolveDefaultAiRoute } from "../electron/main/services/default-ai-runtime";
import { __setRuntimeProvisionerDelegateForTests } from "../electron/main/services/local-runtime-provisioner";
import { DEFAULT_LOCAL_MODEL } from "../src/shared/default-ai-config";
import { resolveProvisioningReadiness } from "../src/shared/provisioning-readiness";

describe("fresh machine provisioning simulation", () => {
  const cleanups: Array<() => void> = [];
  let userDataDir = "";

  afterEach(() => {
    __resetEmbeddedLocalAiManagerForTests();
    __setRuntimeProvisionerDelegateForTests(null);
    vi.unstubAllGlobals();
    if (userDataDir) fs.rmSync(userDataDir, { recursive: true, force: true });
    while (cleanups.length) cleanups.pop()?.();
  });

  it("provisions runtime, downloads model, verifies, and reaches ready", async () => {
    userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "continuity-fresh-machine-"));
    const baseUrl = "http://127.0.0.1:11435";
    let modelInstalled = false;

    __setRuntimeProvisionerDelegateForTests(async () => ({ ok: true, baseUrl }));

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/api/tags")) {
          return new Response(
            JSON.stringify({
              models: [{ name: modelInstalled ? DEFAULT_LOCAL_MODEL : "" }].filter(
                (entry) => entry.name,
              ),
            }),
            { status: 200 },
          );
        }
        if (url.endsWith("/api/pull") && init?.method === "POST") {
          modelInstalled = true;
          return new Response(
            [
              JSON.stringify({ status: "pulling manifest" }),
              JSON.stringify({ status: "downloading", total: 100, completed: 100 }),
              JSON.stringify({ status: "success" }),
            ].join("\n") + "\n",
            { status: 200, headers: { "Content-Type": "application/x-ndjson" } },
          );
        }
        return new Response(JSON.stringify({ models: [{ name: DEFAULT_LOCAL_MODEL }] }), {
          status: 200,
        });
      }),
    );

    const { db, cleanup } = openTestDatabase();
    cleanups.push(cleanup);
    const ws = createWorkspace(db, "Fresh machine");

    const status = await prepareEmbeddedLocalAiOnFirstRun(db, ws.id, userDataDir);
    expect(status.aiRepliesReady).toBe(true);
    expect(status.phase).toBe("ready");

    const route = await resolveDefaultAiRoute(db, ws.id);
    expect(route.canReply).toBe(true);
    expect(route.status).toBe("ready");

    const readiness = resolveProvisioningReadiness({
      embeddedPhase: status.phase,
      canReply: route.canReply,
    });
    expect(readiness.state).toBe("READY");

    const config = getProviderConfig(db, ws.id);
    expect(config?.provider).toBe("ollama");
    expect(config?.enabled).toBe(true);
  });
});
