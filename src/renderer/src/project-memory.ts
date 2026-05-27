/**
 * Consumer-facing project memory helpers.
 * Derives simple, readable state from the data the backend already provides.
 * Never invents facts — uses UNKNOWN or hides sections when data is missing.
 */

import type { MemoryCompressionDraft } from "@shared/types";

export type MemoryHealthStatus =
  | "no_memory"
  | "healthy"
  | "update_suggested"
  | "backup_recommended"
  | "needs_attention";

export type MemoryHealthResult = {
  status: MemoryHealthStatus;
  label: string;
  suggestion: string | null;
};

export type ProjectMemorySnapshot = {
  currentObjective: string | null;
  continuitySummary: string | null;
  decisionsMade: string[];
  openIssues: string[];
  nextSteps: string[];
  recentProgress: string[];
  lastUpdatedAt: string | null;
  hasMemory: boolean;
};

export type ResumeCard = {
  show: boolean;
  objective: string | null;
  lastProgress: string | null;
  nextStep: string | null;
};

export type MemoryUpdateSuggestion = {
  show: boolean;
  reason: string | null;
};

const SIGNAL_WORDS_RE =
  /\b(done|that worked|decision|remember this|next|fixed|completed|changed direction|working now|finished|resolved)\b/i;

const UNKNOWN = "UNKNOWN";

function knownOrNull(value: string | null | undefined): string | null {
  const t = value?.trim();
  if (!t || t.toUpperCase() === UNKNOWN) return null;
  return t;
}

function knownList(items: string[] | null | undefined): string[] {
  return (items ?? [])
    .map((item) => item?.trim())
    .filter((item): item is string => Boolean(item) && item.toUpperCase() !== UNKNOWN);
}

/**
 * Build a consumer-readable snapshot of project memory from a compression draft.
 * Does not invent any facts.
 */
export function buildProjectMemorySnapshot(
  draft: MemoryCompressionDraft | null,
): ProjectMemorySnapshot {
  if (!draft) {
    return {
      currentObjective: null,
      continuitySummary: null,
      decisionsMade: [],
      openIssues: [],
      nextSteps: [],
      recentProgress: [],
      lastUpdatedAt: null,
      hasMemory: false,
    };
  }

  const p = draft.preview;
  const objective = knownOrNull(p.currentObjective);
  const summary = knownOrNull(p.continuitySummary);
  const decisions = knownList(p.decisionsMade);
  const issues = knownList(p.openIssues);
  const steps = knownList(p.nextSteps);
  const progress = knownList(p.recentProgress);
  const hasMemory = Boolean(
    objective || summary || decisions.length || issues.length || steps.length,
  );

  return {
    currentObjective: objective,
    continuitySummary: summary,
    decisionsMade: decisions,
    openIssues: issues,
    nextSteps: steps,
    recentProgress: progress,
    lastUpdatedAt: draft.latestRecordTitle ?? null,
    hasMemory,
  };
}

/**
 * Compute memory health from available signals.
 * Purely deterministic — no background polling.
 */
export function computeMemoryHealth(input: {
  hasMemory: boolean;
  messagesSinceLastUpdate: number;
  updateSuggestThreshold?: number;
  backupNeverDone?: boolean;
  hasError?: boolean;
}): MemoryHealthResult {
  const threshold = input.updateSuggestThreshold ?? 12;

  if (input.hasError) {
    return {
      status: "needs_attention",
      label: "Needs attention",
      suggestion: "A memory or backup issue was detected. Open Project Tools to review.",
    };
  }
  if (!input.hasMemory) {
    return {
      status: "no_memory",
      label: "No memory yet",
      suggestion: "Chat normally and create a memory update when progress is made.",
    };
  }
  if (input.messagesSinceLastUpdate >= threshold) {
    return {
      status: "update_suggested",
      label: "Memory update suggested",
      suggestion: "You have been chatting a while. A memory update helps future sessions.",
    };
  }
  if (input.backupNeverDone) {
    return {
      status: "backup_recommended",
      label: "Backup recommended",
      suggestion: "Back up your project before making more changes.",
    };
  }
  return {
    status: "healthy",
    label: "Memory: Healthy",
    suggestion: null,
  };
}

/**
 * Build a "Resume where you left off" card from a project memory snapshot.
 * Returns show=false when there is nothing meaningful to show.
 */
export function buildResumeCard(snapshot: ProjectMemorySnapshot): ResumeCard {
  if (!snapshot.hasMemory) {
    return { show: false, objective: null, lastProgress: null, nextStep: null };
  }
  const progress =
    snapshot.recentProgress.length > 0
      ? snapshot.recentProgress[snapshot.recentProgress.length - 1]
      : null;
  const step = snapshot.nextSteps.length > 0 ? snapshot.nextSteps[0] : null;

  if (!snapshot.currentObjective && !progress && !step) {
    return { show: false, objective: null, lastProgress: null, nextStep: null };
  }

  return {
    show: true,
    objective: snapshot.currentObjective,
    lastProgress: progress,
    nextStep: step,
  };
}

/**
 * Determine whether to show a smart memory update suggestion.
 * Does not trigger every message. Uses signal words and message threshold.
 */
export function shouldSuggestMemoryUpdate(input: {
  messagesSinceLastUpdate: number;
  latestUserMessage: string | null;
  lastSuggestedAt: number | null;
  nowMs?: number;
  threshold?: number;
  cooldownMs?: number;
}): MemoryUpdateSuggestion {
  const threshold = input.threshold ?? 10;
  const cooldownMs = input.cooldownMs ?? 5 * 60 * 1000; // 5 min cooldown
  const now = input.nowMs ?? Date.now();

  // Respect cooldown
  if (input.lastSuggestedAt != null && now - input.lastSuggestedAt < cooldownMs) {
    return { show: false, reason: null };
  }

  const hasSignal =
    input.latestUserMessage != null && SIGNAL_WORDS_RE.test(input.latestUserMessage);
  const overThreshold = input.messagesSinceLastUpdate >= threshold;

  if (hasSignal) {
    return {
      show: true,
      reason: "signal",
    };
  }
  if (overThreshold) {
    return {
      show: true,
      reason: "threshold",
    };
  }
  return { show: false, reason: null };
}
