export type TrustConfidenceLabel =
  | "confirmed"
  | "likely"
  | "fresh"
  | "unknown"
  | "stale"
  | "conflicting"
  | "needs verification";

export type TrustSignalInput = {
  text?: string;
  source?: string;
  createdAt?: string;
  updatedAt?: string;
  verifiedAt?: string;
  importanceScore?: number;
  buildPassed?: boolean;
  buildFailed?: boolean;
  userConfirmed?: boolean;
  hasConflict?: boolean;
  hasMissingEvidence?: boolean;
  relatedConfidence?: TrustConfidenceLabel[];
};

export type TrustAssessment = {
  confidence: TrustConfidenceLabel;
  score: number;
  reasons: string[];
  shouldPolarisHedge: boolean;
  userFacingCaution: string;
};

const TRUST_LABEL_ORDER: TrustConfidenceLabel[] = [
  "confirmed",
  "likely",
  "fresh",
  "needs verification",
  "unknown",
  "stale",
  "conflicting"
];

function normalizeText(value: unknown): string {
  if (typeof value !== "string") return "";

  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function parseTime(value: unknown): number | null {
  if (typeof value !== "string" || value.trim().length === 0) return null;

  const time = new Date(value).getTime();

  return Number.isFinite(time) ? time : null;
}

function ageInDays(input: TrustSignalInput, now = Date.now()): number | null {
  const time = parseTime(input.updatedAt) ?? parseTime(input.verifiedAt) ?? parseTime(input.createdAt);

  if (time === null) return null;

  return Math.max(0, Math.floor((now - time) / 86400000));
}

function uniqueList(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

export function mergeTrustConfidenceLabels(labels: TrustConfidenceLabel[]): TrustConfidenceLabel {
  const cleanLabels = labels.filter(Boolean);

  if (cleanLabels.length === 0) return "unknown";
  if (cleanLabels.includes("conflicting")) return "conflicting";
  if (cleanLabels.includes("stale")) return "stale";
  if (cleanLabels.includes("unknown")) return "unknown";
  if (cleanLabels.includes("needs verification")) return "needs verification";
  if (cleanLabels.includes("confirmed")) return "confirmed";
  if (cleanLabels.includes("likely")) return "likely";

  return "fresh";
}

export function compareTrustConfidenceLabels(
  first: TrustConfidenceLabel,
  second: TrustConfidenceLabel
): number {
  return TRUST_LABEL_ORDER.indexOf(first) - TRUST_LABEL_ORDER.indexOf(second);
}

export function assessMemoryTrust(input: TrustSignalInput, now = Date.now()): TrustAssessment {
  const text = normalizeText(input.text);
  const reasons: string[] = [];
  let score = typeof input.importanceScore === "number" ? input.importanceScore : 45;

  if (input.userConfirmed || input.buildPassed || text.includes("verified") || text.includes("passed")) {
    score += 30;
    reasons.push("confirmed signal");
  }

  if (input.buildFailed || text.includes("failed") || text.includes("error") || text.includes("broken")) {
    score -= 10;
    reasons.push("failure signal");
  }

  if (input.hasConflict || text.includes("conflict") || text.includes("contradict")) {
    score -= 45;
    reasons.push("conflict signal");
  }

  if (input.hasMissingEvidence || text.includes("unknown") || text.includes("not sure") || text.includes("missing")) {
    score -= 25;
    reasons.push("missing evidence signal");
  }

  const daysOld = ageInDays(input, now);

  if (daysOld !== null && daysOld > 30) {
    score -= 25;
    reasons.push(`stale age: ${daysOld} days`);
  } else if (daysOld !== null && daysOld <= 3) {
    score += 8;
    reasons.push(`fresh age: ${daysOld} days`);
  }

  const relatedConfidence = input.relatedConfidence || [];

  if (relatedConfidence.length > 0) {
    const mergedRelated = mergeTrustConfidenceLabels(relatedConfidence);
    reasons.push(`related confidence: ${mergedRelated}`);

    if (mergedRelated === "confirmed") score += 10;
    if (mergedRelated === "likely") score += 5;
    if (mergedRelated === "needs verification") score -= 10;
    if (mergedRelated === "unknown") score -= 15;
    if (mergedRelated === "stale") score -= 20;
    if (mergedRelated === "conflicting") score -= 35;
  }

  score = clampScore(score);

  let confidence: TrustConfidenceLabel = "fresh";

  if (input.hasConflict || text.includes("conflict") || text.includes("contradict")) {
    confidence = "conflicting";
  } else if (daysOld !== null && daysOld > 30) {
    confidence = "stale";
  } else if (input.hasMissingEvidence || text.includes("unknown") || text.includes("not sure")) {
    confidence = "unknown";
  } else if (score >= 80 && (input.userConfirmed || input.buildPassed || text.includes("verified") || text.includes("passed"))) {
    confidence = "confirmed";
  } else if (score >= 65) {
    confidence = "likely";
  } else if (score < 35) {
    confidence = "needs verification";
  }

  const shouldPolarisHedge =
    confidence === "unknown" ||
    confidence === "stale" ||
    confidence === "conflicting" ||
    confidence === "needs verification";

  return {
    confidence,
    score,
    reasons: uniqueList(reasons),
    shouldPolarisHedge,
    userFacingCaution: buildTrustCaution(confidence)
  };
}

export function buildTrustCaution(confidence: TrustConfidenceLabel): string {
  switch (confidence) {
    case "confirmed":
      return "This is confirmed by the latest available project evidence.";
    case "likely":
      return "This is likely based on the current project memory, but should still be verified if it affects code.";
    case "fresh":
      return "This is fresh context from the current work session.";
    case "unknown":
      return "I do not have enough evidence to treat this memory as confirmed.";
    case "stale":
      return "This memory may be stale and should be checked against the current code or logs.";
    case "conflicting":
      return "This memory conflicts with other context, so Polaris should not present it as fact.";
    case "needs verification":
      return "This memory needs verification before it is used as a firm conclusion.";
    default:
      return "This memory should be treated carefully.";
  }
}

export function shouldUseMemoryWithoutHedging(confidence: TrustConfidenceLabel): boolean {
  return confidence === "confirmed" || confidence === "fresh";
}

export function shouldAskForVerification(confidence: TrustConfidenceLabel): boolean {
  return confidence === "unknown" || confidence === "stale" || confidence === "conflicting" || confidence === "needs verification";
}

export function formatTrustAssessmentForSnapshot(assessment: TrustAssessment): string {
  return [
    `- Confidence: ${assessment.confidence}`,
    `- Trust score: ${assessment.score}/100`,
    `- Should Polaris hedge: ${assessment.shouldPolarisHedge ? "yes" : "no"}`,
    `- Caution: ${assessment.userFacingCaution}`,
    `- Reasons: ${assessment.reasons.length > 0 ? assessment.reasons.join(", ") : "none"}`
  ].join("\n");
}
