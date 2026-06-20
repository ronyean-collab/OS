import { describe, expect, it } from "vitest";
import { resolveProvisioningReadiness } from "../src/shared/provisioning-readiness";

describe("provisioning readiness", () => {
  it("returns READY only when canReply is true", () => {
    const view = resolveProvisioningReadiness({
      embeddedPhase: "ready",
      canReply: true,
    });
    expect(view.state).toBe("READY");
    expect(view.canReply).toBe(true);
  });

  it("maps downloading phase to DOWNLOADING", () => {
    const view = resolveProvisioningReadiness({
      embeddedPhase: "downloading",
      canReply: false,
    });
    expect(view.state).toBe("DOWNLOADING");
    expect(view.consumerMessage).toContain("Downloading");
  });

  it("maps runtime install to PREPARING and runtime start to STARTING", () => {
    expect(
      resolveProvisioningReadiness({ embeddedPhase: "installing_runtime", canReply: false }).state,
    ).toBe("PREPARING");
    expect(
      resolveProvisioningReadiness({ embeddedPhase: "starting_runtime", canReply: false }).state,
    ).toBe("STARTING");
  });

  it("maps failed phases to FAILED with needs attention copy", () => {
    const view = resolveProvisioningReadiness({
      embeddedPhase: "failed",
      canReply: false,
      defaultAiRouteStatus: "needs_attention",
    });
    expect(view.state).toBe("FAILED");
    expect(view.consumerMessage).toContain("needs attention");
  });

  it("uses NO_INTERNET copy only when offline is confirmed", () => {
    const offline = resolveProvisioningReadiness({
      embeddedPhase: "offline_waiting",
      canReply: false,
      offline: true,
    });
    expect(offline.consumerMessage).toBe(
      "Internet connection required to download AI.",
    );
    expect(offline.consumerMessage).not.toContain("when you're online");

    const ambiguous = resolveProvisioningReadiness({
      embeddedPhase: "offline_waiting",
      canReply: false,
      offline: false,
    });
    expect(ambiguous.consumerMessage).not.toContain("when you're online");
  });

  it("never returns multiple active states", () => {
    const phases = [
      "idle",
      "checking",
      "installing_runtime",
      "starting_runtime",
      "downloading",
      "preparing",
      "ready",
      "failed",
      "offline_waiting",
    ] as const;
    for (const phase of phases) {
      const view = resolveProvisioningReadiness({ embeddedPhase: phase, canReply: false });
      expect(view.state).toMatch(/^(PREPARING|DOWNLOADING|STARTING|VERIFYING|READY|FAILED)$/);
    }
  });
});
