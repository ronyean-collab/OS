import { afterEach, describe, expect, it, vi } from "vitest";
import { openTestDatabase } from "../electron/main/database/test-db";
import { createThread, createWorkspace, updateContinuitySummary } from "../electron/main/services/workspace-service";
import { saveProviderConfig } from "../electron/main/services/provider-service";
import { getLocalAiStatus } from "../electron/main/services/local-ai-service";
import { startAssistantStream } from "../electron/main/services/stream-runtime";
import { listMessages } from "../electron/main/services/message-service";
import { applyContinuityImportFile } from "../electron/main/services/continuity-import-file";

const mockSender = {
  isDestroyed: () => false,
  send: vi.fn(),
} as unknown as import("electron").WebContents;

describe("local AI / Ollama", () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    while (cleanups.length) cleanups.pop()?.();
  });

  function session() {
    const opened = openTestDatabase();
    cleanups.push(opened.cleanup);
    return opened.db;
  }

  it("returns a calm not-running status when Ollama is unavailable", async () => {
    const db = session();
    const workspace = createWorkspace(db, "Local AI");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

    const status = await getLocalAiStatus(db, workspace.id);
    expect(status.detected).toBe(false);
    expect(status.state).toBe("ollama_not_detected");
    expect(status.message).toMatch(/Install or start Ollama/i);
    expect(status.models).toEqual([]);
  });

  it("uses Ollama without an API key and includes imported state in context", async () => {
    const db = session();
    const workspace = createWorkspace(db, "Ollama workspace");
    updateContinuitySummary(db, workspace.id, "Keep the app local-first.");
    const thread = createThread(db, workspace.id, "Chat");
    saveProviderConfig(db, workspace.id, "ollama", "llama3.1", "", "http://localhost:11434");
    applyContinuityImportFile(
      db,
      {
        workspaceId: workspace.id,
        mode: "update-current",
        text: `# CONTINUITYOS IMPORT FILE
version: 1
source_ai: Claude
generated_at: 2026-05-25T10:00:00.000Z
project_name: Local AI workspace
project_type: Desktop app
## CURRENT OBJECTIVE
Route chat through local AI when available.
## STABLE FACTS
- Local AI is optional
## NEXT STEPS
- Keep fallback calm
`,
      },
    );

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          model: "llama3.1",
          message: { content: "Local response complete." },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await startAssistantStream(db, mockSender, {
      threadId: thread.id,
      content: "Use local AI please",
    });

    expect(result.streamId).toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve, 20));

    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      model: string;
      messages: Array<{ role: string; content: string }>;
    };
    const systemMessage = requestBody.messages.find((message) => message.role === "system");
    expect(systemMessage?.content).toContain("Keep the app local-first.");
    expect(systemMessage?.content).toContain("Route chat through local AI when available.");
    expect(systemMessage?.content).toContain("Local AI is optional");

    const messages = listMessages(db, thread.id);
    expect(messages.some((message) => message.content === "Use local AI please")).toBe(true);
    expect(messages.some((message) => message.content === "Local response complete.")).toBe(true);
    const assistant = messages.find((message) => message.role === "assistant");
    expect(assistant?.provider).toBe("ollama");
    expect(assistant?.model).toBe("llama3.1");
  });
});
