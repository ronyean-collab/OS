import { describe, expect, it } from "vitest";
import {
  LEGACY_GENERIC_ONLINE_MESSAGE,
  PREPARATION_REASON_MATRIX,
  formatRecommendedAction,
  isConfirmedNoInternet,
  preparationReasonConsumerMessage,
  resolvePreparationReason,
  resolvePreparationReasonPresentation,
  type PreparationReason,
} from "../src/shared/preparation-reasons";

const ALL_REASONS: PreparationReason[] = [
  "NO_INTERNET",
  "MISSING_RUNTIME",
  "RUNTIME_START_FAILED",
  "MODEL_MISSING",
  "MODEL_DOWNLOADING",
  "DOWNLOAD_FAILED",
  "VERIFYING",
  "READY",
  "UNKNOWN_FAILURE",
];

describe("preparation reason matrix", () => {
  for (const reason of ALL_REASONS) {
    it(`${reason} has consumer copy and action metadata`, () => {
      const def = PREPARATION_REASON_MATRIX[reason];
      expect(def.consumerMessage.trim().length).toBeGreaterThan(0);
      expect(def.currentStateLabel.trim().length).toBeGreaterThan(0);
      expect(def.reasonDetail.trim().length).toBeGreaterThan(0);
      expect(def.whatHappensNext.trim().length).toBeGreaterThan(0);
      expect(typeof def.actionRequired).toBe("boolean");
      if (def.actionRequired) {
        expect(def.actionLabel).toBeTruthy();
      }
      expect(formatRecommendedAction(def).length).toBeGreaterThan(0);
    });
  }

  it("NO_INTERNET uses required internet copy", () => {
    expect(PREPARATION_REASON_MATRIX.NO_INTERNET.consumerMessage).toBe(
      "Internet connection required to download AI.",
    );
    expect(PREPARATION_REASON_MATRIX.NO_INTERNET.actionRequired).toBe(false);
  });

  it("MODEL_DOWNLOADING uses downloading copy", () => {
    expect(PREPARATION_REASON_MATRIX.MODEL_DOWNLOADING.consumerMessage).toBe(
      "Downloading AI.",
    );
  });

  it("DOWNLOAD_FAILED uses failed download copy", () => {
    expect(PREPARATION_REASON_MATRIX.DOWNLOAD_FAILED.consumerMessage).toBe(
      "We couldn't download the AI.",
    );
    expect(PREPARATION_REASON_MATRIX.DOWNLOAD_FAILED.actionRequired).toBe(true);
  });
});

describe("resolvePreparationReason", () => {
  const cases: Array<{
    reason: PreparationReason;
    input: Parameters<typeof resolvePreparationReason>[0];
  }> = [
    {
      reason: "READY",
      input: { workspaceLoaded: true, canReply: true, embeddedPhase: "ready" },
    },
    {
      reason: "NO_INTERNET",
      input: {
        workspaceLoaded: true,
        canReply: false,
        embeddedPhase: "offline_waiting",
        offline: true,
      },
    },
    {
      reason: "MISSING_RUNTIME",
      input: {
        workspaceLoaded: true,
        canReply: false,
        embeddedPhase: "installing_runtime",
      },
    },
    {
      reason: "RUNTIME_START_FAILED",
      input: {
        workspaceLoaded: true,
        canReply: false,
        embeddedPhase: "failed",
        hasFailed: true,
        embeddedError: "connect ECONNREFUSED 127.0.0.1:11435",
      },
    },
    {
      reason: "MODEL_MISSING",
      input: {
        workspaceLoaded: true,
        canReply: false,
        embeddedPhase: "failed",
        hasFailed: true,
        embeddedError: "model missing from disk",
      },
    },
    {
      reason: "MODEL_DOWNLOADING",
      input: {
        workspaceLoaded: true,
        canReply: false,
        embeddedPhase: "downloading",
      },
    },
    {
      reason: "DOWNLOAD_FAILED",
      input: {
        workspaceLoaded: true,
        canReply: false,
        embeddedPhase: "failed",
        hasFailed: true,
        embeddedError: "download interrupted",
      },
    },
    {
      reason: "VERIFYING",
      input: {
        workspaceLoaded: true,
        canReply: false,
        embeddedPhase: "preparing",
      },
    },
    {
      reason: "UNKNOWN_FAILURE",
      input: {
        workspaceLoaded: true,
        canReply: false,
        embeddedPhase: "offline_waiting",
        offline: false,
      },
    },
  ];

  for (const { reason, input } of cases) {
    it(`resolves ${reason}`, () => {
      expect(resolvePreparationReason(input)).toBe(reason);
      const presentation = resolvePreparationReasonPresentation(input);
      expect(presentation.reason).toBe(reason);
      expect(presentation.consumerMessage).toBe(
        PREPARATION_REASON_MATRIX[reason].consumerMessage,
      );
    });
  }

  it("does not use legacy generic online message for new copy", () => {
    expect(PREPARATION_REASON_MATRIX.NO_INTERNET.consumerMessage).not.toBe(
      LEGACY_GENERIC_ONLINE_MESSAGE,
    );
    expect(
      preparationReasonConsumerMessage({
        workspaceLoaded: true,
        canReply: false,
        embeddedPhase: "downloading",
      }),
    ).not.toBe(LEGACY_GENERIC_ONLINE_MESSAGE);
  });

  it("isConfirmedNoInternet requires offline flag", () => {
    expect(isConfirmedNoInternet({ offline: true })).toBe(true);
    expect(isConfirmedNoInternet({ offline: false })).toBe(false);
    expect(isConfirmedNoInternet({})).toBe(false);
  });
});
