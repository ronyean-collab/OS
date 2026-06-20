import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deriveLocalAiCardState } from "../src/shared/local-ai-card-state";
import { buildAiReadinessView } from "../src/shared/ai-readiness";
import { resolveDefaultAiRoute } from "../electron/main/services/default-ai-runtime";
import { openTestDatabase } from "../electron/main/database/test-db";
import { createWorkspace } from "../electron/main/services/workspace-service";
import { __resetEmbeddedLocalAiManagerForTests } from "../electron/main/services/embedded-local-ai-manager";
import { __setLocalAiStatusDelegateForTests } from "../electron/main/services/local-ai-service";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

beforeEach(() => {
  __setLocalAiStatusDelegateForTests(async () => ({
    state: "ollama_not_running",
    message: "Local AI is unavailable.",
    detected: false,
    baseUrl: "http://127.0.0.1:9",
    models: [],
    selectedModel: null,
  }));
});

describe("chat composer layout", () => {
  it("styles keep composer sticky and chat column constrained", () => {
    const css = readFileSync(path.join(root, "src/renderer/src/styles.css"), "utf8");
    expect(css).toContain(".chat-column");
    expect(css).toContain(".chat-composer-shell");
    expect(css).toContain("position: sticky");
    expect(css).toContain(".chat-panel-scroll");
  });

  it("ChatPanel exposes composer shell test id outside scroll region", () => {
    const tsx = readFileSync(
      path.join(root, "src/renderer/src/components/ChatPanel.tsx"),
      "utf8",
    );
    expect(tsx).toContain('data-testid="chat-composer-shell"');
    expect(tsx).toContain("chat-panel-scroll");
    const scrollIndex = tsx.indexOf("chat-panel-scroll");
    const composerIndex = tsx.indexOf('data-testid="chat-composer-shell"');
    expect(scrollIndex).toBeGreaterThan(-1);
    expect(composerIndex).toBeGreaterThan(scrollIndex);
  });

  it("App wraps chat in chat-column for side panel layout", () => {
    const app = readFileSync(path.join(root, "src/renderer/src/App.tsx"), "utf8");
    expect(app).toContain('data-testid="chat-column"');
    expect(app).toContain("showProjectTools");
  });
});

describe("AI readiness truth", () => {
  afterEach(() => {
    __resetEmbeddedLocalAiManagerForTests();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("never sets canReply true without verified route", async () => {
    const { db, cleanup } = openTestDatabase();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );
    const ws = createWorkspace(db, "Fresh");
    const route = await resolveDefaultAiRoute(db, ws.id);
    expect(route.canReply).toBe(false);
    expect(route.providerReady).toBe(false);
    expect(route.status).not.toBe("ready");
    cleanup();
  });

  it("local AI card never shows ready when canReply is false", () => {
    const card = deriveLocalAiCardState({
      canReply: false,
      embedded: {
        label: "Ready",
        message: "ContinuityOS AI is ready.",
        detail: "ContinuityOS AI is ready.",
        phase: "ready",
        progressPercent: 100,
        canChat: true,
        aiRepliesReady: true,
        chatWhilePreparingMessage: "",
        offline: false,
        paused: false,
      },
      localAiStatus: null,
      lastTest: { ok: false, status: "ollama_not_running", message: "offline" },
    });
    expect(card.statusPill).not.toBe("Ready");
    expect(card.headline).not.toMatch(/is ready/i);
  });

  it("buildAiReadinessView maps canReply to consumer message", () => {
    const ready = buildAiReadinessView({ status: "ready", canReply: true });
    expect(ready.consumerMessage).toMatch(/ready/i);
    const preparing = buildAiReadinessView({ status: "preparing", canReply: false });
    expect(preparing.canReply).toBe(false);
  });
});

describe("fresh machine readiness", () => {
  afterEach(() => {
    __resetEmbeddedLocalAiManagerForTests();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("fresh install without runtime stays unavailable and not ready", async () => {
    const { db, cleanup } = openTestDatabase();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );
    const ws = createWorkspace(db, "Fresh machine");
    const route = await resolveDefaultAiRoute(db, ws.id);
    expect(["unavailable", "manual_mode", "preparing", "downloading", "needs_attention"]).toContain(route.status);
    expect(route.canReply).toBe(false);
    expect(route.consumerMessage.toLowerCase()).not.toContain("you can start chatting");
    cleanup();
  });
});
