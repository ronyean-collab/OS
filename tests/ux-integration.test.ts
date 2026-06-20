import { describe, expect, it } from "vitest";
import {
  failTransfer,
  startTransfer,
  succeedTransfer,
} from "../src/shared/transfer-ux";
import { normalizeWorkspaceOpsTab, postOnboardingWorkspaceTab } from "../src/shared/workspace-ops";
import { postOnboardingOpsTab } from "../src/shared/onboarding-state";
import { simulateRestartPersistence } from "../src/shared/startup-flow";

describe("UX integration harness", () => {
  it("maps workspace ops tabs from legacy ids", () => {
    expect(normalizeWorkspaceOpsTab("local-ai")).toBe("settings");
    expect(normalizeWorkspaceOpsTab("providers")).toBe("settings");
    expect(normalizeWorkspaceOpsTab("overview")).toBe("backups");
    expect(normalizeWorkspaceOpsTab("activity")).toBe("settings");
  });

  it("routes onboarding completion to settings", () => {
    expect(postOnboardingOpsTab("ollama")).toBe("settings");
    expect(postOnboardingWorkspaceTab("ollama")).toBe("settings");
    expect(postOnboardingOpsTab("later")).toBe("settings");
  });

  it("models export transfer success and failure", () => {
    expect(startTransfer("export", "Working").phase).toBe("working");
    expect(succeedTransfer("export", "Done").phase).toBe("success");
    expect(failTransfer("import", "Bad file").recoveryHint).toMatch(/not changed/i);
  });

  it("persists wizard step across restart simulation", () => {
    let stored: { step: number } | null = null;
    const value = simulateRestartPersistence(
      () => stored,
      (next) => {
        stored = next;
      },
      { step: 3 },
    );
    expect(value?.step).toBe(3);
  });
});
