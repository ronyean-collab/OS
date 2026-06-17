import { v4 as uuid } from "uuid";
import type Database from "better-sqlite3";
import type { MessageRole } from "../../../src/shared/types";
import {
  getMemoryState,
  rebuildDerivedMemoryFromCanonical,
  scoreContinuityReconstruction,
} from "./memory-state-service";

export type ImportanceTier = "low" | "medium" | "high" | "very_high" | "critical";

export type ContinuityScores = {
  importanceScore: number;
  continuityScore: number;
  projectScore: number;
  confidenceScore: number;
  importanceTier: ImportanceTier;
};

export type ContinuitySignal = {
  id: string;
  kind:
    | "decision"
    | "open_question"
    | "milestone"
    | "preference"
    | "unresolved_work"
    | "important_event"
    | "change";
  content: string;
  sourceMessageId: string | null;
  threadId: string;
  discussedAt: string;
  scores: ContinuityScores;
};

export type DecisionRecord = {
  id: string;
  workspaceId: string;
  threadId: string;
  sourceMessageId: string | null;
  title: string;
  description: string;
  decidedAt: string;
  scores: ContinuityScores;
  createdAt: string;
  updatedAt: string;
};

export type OpenQuestionRecord = {
  id: string;
  workspaceId: string;
  threadId: string;
  sourceMessageId: string | null;
  question: string;
  status: "open" | "resolved" | "deferred";
  scores: ContinuityScores;
  lastDiscussedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type TimelineEvent = {
  id: string;
  title: string;
  description: string;
  occurredAt: string;
  significance: ImportanceTier;
  source: "workspace" | "message" | "decision" | "timeline" | "milestone";
};

export type ContinuitySnapshot = {
  workspaceId: string;
  workspaceName: string;
  generatedAt: string;
  continuityScore: number;
  currentObjective: string | null;
  recentDecisions: string[];
  openQuestions: string[];
  knownStableState: string[];
  currentRisks: string[];
  importantPreferences: string[];
  recentProgress: string[];
  markdown: string;
};

export type ContinuityHealthMetrics = {
  continuityCoverage: number;
  continuityConfidence: number;
  rebuildConfidence: number;
  projectAwareness: number;
  decisionCoverage: number;
  openQuestionCoverage: number;
};

export type ConversationAnalysis = {
  signals: ContinuitySignal[];
  decisions: DecisionRecord[];
  openQuestions: OpenQuestionRecord[];
  milestones: TimelineEvent[];
  continuityScore: number;
  health: ContinuityHealthMetrics;
};

export type ContinuityIntelligenceExport = {
  version: 1;
  decisions: DecisionRecord[];
  openQuestions: OpenQuestionRecord[];
  latestSnapshot: ContinuitySnapshot | null;
  timeline: TimelineEvent[];
  health: ContinuityHealthMetrics | null;
};

const DECISION_RE =
  /\b(decided|decision|we will|we should|chosen|settled|implemented|adopted|declared|moved to|switched to|prioritize)\b/i;
const MILESTONE_RE =
  /\b(completed|shipped|added|layer|phase|foundation|implemented|adopted|finished|released)\b/i;
const OPEN_QUESTION_RE =
  /\?|(?:\b(?:tbd|todo|open question|unresolved|pending|future work|need to decide|still need|not sure|unclear)\b)/i;
const PREFERENCE_RE = /\b(prefer|like|always|never want|favorite|i want)\b/i;
const RISK_RE = /\b(risk|blocker|concern|worried|failure|broken|regression)\b/i;
const CHANGE_RE = /\b(changed|updated|revised|pivot|shifted|replaced|deprecated)\b/i;

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function truncate(value: string, maxChars: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, maxChars).trimEnd()}…`;
}

function uniqueKey(value: string): string {
  return normalizeWhitespace(value).toLowerCase();
}

function monthKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 7);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function sentenceCandidates(content: string): string[] {
  return content
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.!?])\s+/))
    .map((line) => normalizeWhitespace(line))
    .filter((line) => line.length >= 12);
}

function tierFromScore(score: number): ImportanceTier {
  if (score >= 0.92) return "critical";
  if (score >= 0.8) return "very_high";
  if (score >= 0.62) return "high";
  if (score >= 0.38) return "medium";
  return "low";
}

export function scoreContinuityItem(input: {
  kind: ContinuitySignal["kind"];
  content: string;
  role?: MessageRole;
}): ContinuityScores {
  const lower = normalizeWhitespace(input.content).toLowerCase();
  let importance = 0.35;
  let continuity = 0.45;
  let project = 0.4;
  let confidence = 0.55;

  if (input.kind === "decision") {
    importance = 0.78;
    continuity = 0.86;
    project = 0.82;
    confidence = 0.72;
  } else if (input.kind === "milestone") {
    importance = 0.84;
    continuity = 0.8;
    project = 0.9;
    confidence = 0.68;
  } else if (input.kind === "open_question") {
    importance = 0.62;
    continuity = 0.74;
    project = 0.7;
    confidence = 0.58;
  } else if (input.kind === "preference") {
    importance = 0.28;
    continuity = 0.55;
    project = 0.25;
    confidence = 0.62;
  } else if (input.kind === "unresolved_work") {
    importance = 0.68;
    continuity = 0.76;
    project = 0.72;
    confidence = 0.6;
  } else if (input.kind === "change") {
    importance = 0.72;
    continuity = 0.78;
    project = 0.76;
    confidence = 0.65;
  }

  if (/\b(critical|must|never|always|source of truth|architecture|strategy)\b/.test(lower)) {
    importance += 0.12;
    project += 0.1;
    continuity += 0.08;
  }
  if (/\b(pizza|coffee|color|font|theme)\b/.test(lower)) {
    importance = Math.min(importance, 0.32);
    project = Math.min(project, 0.28);
  }
  if (/\b(authentication|provider|identity|continuity|memory|export|import|security)\b/.test(lower)) {
    importance += 0.1;
    project += 0.12;
    continuity += 0.1;
  }
  if (input.role === "user") confidence += 0.06;
  if (/\?$/.test(lower)) confidence -= 0.04;

  const importanceScore = Number(Math.min(1, importance).toFixed(3));
  return {
    importanceScore,
    continuityScore: Number(Math.min(1, continuity).toFixed(3)),
    projectScore: Number(Math.min(1, project).toFixed(3)),
    confidenceScore: Number(Math.min(1, confidence).toFixed(3)),
    importanceTier: tierFromScore(importanceScore),
  };
}

function classifySentence(
  sentence: string,
  role: MessageRole,
): ContinuitySignal["kind"] | null {
  const lower = sentence.toLowerCase();
  if (DECISION_RE.test(lower)) return "decision";
  if (OPEN_QUESTION_RE.test(lower)) return "open_question";
  if (MILESTONE_RE.test(lower)) return "milestone";
  if (PREFERENCE_RE.test(lower)) return "preference";
  if (CHANGE_RE.test(lower)) return "change";
  if (RISK_RE.test(lower)) return "unresolved_work";
  if (/\b(important|milestone|major|significant)\b/.test(lower)) return "important_event";
  return null;
}

function mapDecisionRow(row: Record<string, unknown>): DecisionRecord {
  const scores: ContinuityScores = {
    importanceScore: Number(row.importance_score),
    continuityScore: Number(row.continuity_score),
    projectScore: Number(row.project_score),
    confidenceScore: Number(row.confidence_score),
    importanceTier: tierFromScore(Number(row.importance_score)),
  };
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    threadId: String(row.thread_id),
    sourceMessageId: row.source_message_id != null ? String(row.source_message_id) : null,
    title: String(row.title),
    description: String(row.description),
    decidedAt: String(row.decided_at),
    scores,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapOpenQuestionRow(row: Record<string, unknown>): OpenQuestionRecord {
  const scores: ContinuityScores = {
    importanceScore: Number(row.importance_score),
    continuityScore: Number(row.continuity_score),
    projectScore: Number(row.project_score),
    confidenceScore: Number(row.confidence_score),
    importanceTier: tierFromScore(Number(row.importance_score)),
  };
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    threadId: String(row.thread_id),
    sourceMessageId: row.source_message_id != null ? String(row.source_message_id) : null,
    question: String(row.question),
    status: String(row.status) as OpenQuestionRecord["status"],
    scores,
    lastDiscussedAt: String(row.last_discussed_at),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function upsertDecisionRecord(
  db: Database.Database,
  input: {
    workspaceId: string;
    threadId: string;
    sourceMessageId: string | null;
    title: string;
    description: string;
    decidedAt: string;
    scores: ContinuityScores;
  },
): DecisionRecord {
  const key = uniqueKey(`${input.title}:${input.description}`);
  const existing = db
    .prepare(
      `SELECT id FROM continuity_decision_records
       WHERE workspace_id = ? AND lower(title || ':' || description) = ?`,
    )
    .get(input.workspaceId, key) as { id: string } | undefined;

  const now = new Date().toISOString();
  const id = existing?.id ?? uuid();
  if (existing) {
    db.prepare(
      `UPDATE continuity_decision_records SET
        importance_score = ?, continuity_score = ?, project_score = ?, confidence_score = ?,
        decided_at = ?, updated_at = ?, source_message_id = COALESCE(?, source_message_id)
       WHERE id = ?`,
    ).run(
      input.scores.importanceScore,
      input.scores.continuityScore,
      input.scores.projectScore,
      input.scores.confidenceScore,
      input.decidedAt,
      now,
      input.sourceMessageId,
      id,
    );
  } else {
    db.prepare(
      `INSERT INTO continuity_decision_records (
        id, workspace_id, thread_id, source_message_id, title, description, decided_at,
        importance_score, continuity_score, project_score, confidence_score, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      input.workspaceId,
      input.threadId,
      input.sourceMessageId,
      input.title,
      input.description,
      input.decidedAt,
      input.scores.importanceScore,
      input.scores.continuityScore,
      input.scores.projectScore,
      input.scores.confidenceScore,
      now,
      now,
    );
  }

  return mapDecisionRow(
    db.prepare("SELECT * FROM continuity_decision_records WHERE id = ?").get(id) as Record<
      string,
      unknown
    >,
  );
}

function upsertOpenQuestionRecord(
  db: Database.Database,
  input: {
    workspaceId: string;
    threadId: string;
    sourceMessageId: string | null;
    question: string;
    lastDiscussedAt: string;
    scores: ContinuityScores;
    status?: OpenQuestionRecord["status"];
  },
): OpenQuestionRecord {
  const key = uniqueKey(input.question);
  const existing = db
    .prepare(
      `SELECT id, status FROM continuity_open_question_records
       WHERE workspace_id = ? AND lower(question) = ?`,
    )
    .get(input.workspaceId, key) as { id: string; status: string } | undefined;

  const now = new Date().toISOString();
  const id = existing?.id ?? uuid();
  const status = input.status ?? (existing?.status as OpenQuestionRecord["status"]) ?? "open";
  if (existing) {
    db.prepare(
      `UPDATE continuity_open_question_records SET
        importance_score = ?, continuity_score = ?, project_score = ?, confidence_score = ?,
        last_discussed_at = ?, updated_at = ?, source_message_id = COALESCE(?, source_message_id), status = ?
       WHERE id = ?`,
    ).run(
      input.scores.importanceScore,
      input.scores.continuityScore,
      input.scores.projectScore,
      input.scores.confidenceScore,
      input.lastDiscussedAt,
      now,
      input.sourceMessageId,
      status,
      id,
    );
  } else {
    db.prepare(
      `INSERT INTO continuity_open_question_records (
        id, workspace_id, thread_id, source_message_id, question, status,
        importance_score, continuity_score, project_score, confidence_score,
        last_discussed_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      input.workspaceId,
      input.threadId,
      input.sourceMessageId,
      input.question,
      status,
      input.scores.importanceScore,
      input.scores.continuityScore,
      input.scores.projectScore,
      input.scores.confidenceScore,
      input.lastDiscussedAt,
      now,
      now,
    );
  }

  return mapOpenQuestionRow(
    db.prepare("SELECT * FROM continuity_open_question_records WHERE id = ?").get(id) as Record<
      string,
      unknown
    >,
  );
}

function updateFragmentScores(
  db: Database.Database,
  workspaceId: string,
  threadId: string,
): void {
  const rows = db
    .prepare(
      `SELECT id, fragment_type, content FROM memory_fragments
       WHERE workspace_id = ? AND thread_id = ?`,
    )
    .all(workspaceId, threadId) as Array<{
    id: string;
    fragment_type: string;
    content: string;
  }>;

  const update = db.prepare(
    `UPDATE memory_fragments SET
      continuity_score = ?, project_score = ?, confidence_score = ?
     WHERE id = ?`,
  );

  for (const row of rows) {
    const kind =
      row.fragment_type === "decision"
        ? "decision"
        : row.fragment_type === "open_loop"
          ? "open_question"
          : row.fragment_type === "project_goal"
            ? "milestone"
            : row.fragment_type === "user_preference"
              ? "preference"
              : "important_event";
    const scores = scoreContinuityItem({ kind, content: row.content });
    update.run(scores.continuityScore, scores.projectScore, scores.confidenceScore, row.id);
  }
}

export function extractContinuitySignals(
  db: Database.Database,
  input: { workspaceId: string; threadId: string; limit?: number },
): ContinuitySignal[] {
  const limit = input.limit ?? 500;
  const messages = db
    .prepare(
      `SELECT id, role, content, created_at FROM messages
       WHERE thread_id = ?
       ORDER BY created_at ASC, id ASC
       LIMIT ?`,
    )
    .all(input.threadId, limit) as Array<{
    id: string;
    role: MessageRole;
    content: string;
    created_at: string;
  }>;

  const signals: ContinuitySignal[] = [];
  const seen = new Set<string>();

  for (const message of messages) {
    for (const sentence of sentenceCandidates(message.content)) {
      const kind = classifySentence(sentence, message.role);
      if (!kind) continue;
      const key = `${kind}:${uniqueKey(sentence)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const scores = scoreContinuityItem({ kind, content: sentence, role: message.role });
      signals.push({
        id: uuid(),
        kind,
        content: sentence,
        sourceMessageId: message.id,
        threadId: input.threadId,
        discussedAt: message.created_at,
        scores,
      });
    }
  }

  return signals.sort((a, b) => b.scores.importanceScore - a.scores.importanceScore);
}

export function extractProjectDecisions(
  db: Database.Database,
  workspaceId: string,
  threadId?: string,
): DecisionRecord[] {
  const threads = threadId
    ? [{ id: threadId }]
    : (db
        .prepare("SELECT id FROM threads WHERE workspace_id = ?")
        .all(workspaceId) as Array<{ id: string }>);

  for (const thread of threads) {
    const signals = extractContinuitySignals(db, {
      workspaceId,
      threadId: thread.id,
    }).filter((signal) => signal.kind === "decision" || signal.kind === "milestone" || signal.kind === "change");

    for (const signal of signals) {
      const title = truncate(signal.content, 80);
      upsertDecisionRecord(db, {
        workspaceId,
        threadId: signal.threadId,
        sourceMessageId: signal.sourceMessageId,
        title,
        description: signal.content,
        decidedAt: monthKey(signal.discussedAt),
        scores: signal.scores,
      });
    }
  }

  const query = threadId
    ? `SELECT * FROM continuity_decision_records WHERE workspace_id = ? AND thread_id = ? ORDER BY decided_at DESC, importance_score DESC`
    : `SELECT * FROM continuity_decision_records WHERE workspace_id = ? ORDER BY decided_at DESC, importance_score DESC`;
  const rows = (threadId
    ? db.prepare(query).all(workspaceId, threadId)
    : db.prepare(query).all(workspaceId)) as Array<Record<string, unknown>>;

  return rows.map(mapDecisionRow);
}

export function extractOpenQuestions(
  db: Database.Database,
  workspaceId: string,
  threadId?: string,
): OpenQuestionRecord[] {
  const threads = threadId
    ? [{ id: threadId }]
    : (db
        .prepare("SELECT id FROM threads WHERE workspace_id = ?")
        .all(workspaceId) as Array<{ id: string }>);

  for (const thread of threads) {
    const signals = extractContinuitySignals(db, {
      workspaceId,
      threadId: thread.id,
    }).filter(
      (signal) =>
        signal.kind === "open_question" ||
        signal.kind === "unresolved_work" ||
        (signal.kind === "important_event" && /\?/.test(signal.content)),
    );

    for (const signal of signals) {
      upsertOpenQuestionRecord(db, {
        workspaceId,
        threadId: signal.threadId,
        sourceMessageId: signal.sourceMessageId,
        question: signal.content,
        lastDiscussedAt: signal.discussedAt,
        scores: signal.scores,
      });
    }
  }

  const query = threadId
    ? `SELECT * FROM continuity_open_question_records WHERE workspace_id = ? AND thread_id = ? ORDER BY last_discussed_at DESC`
    : `SELECT * FROM continuity_open_question_records WHERE workspace_id = ? ORDER BY last_discussed_at DESC`;
  const rows = (threadId
    ? db.prepare(query).all(workspaceId, threadId)
    : db.prepare(query).all(workspaceId)) as Array<Record<string, unknown>>;

  return rows.map(mapOpenQuestionRow);
}

export function calculateContinuityScore(
  db: Database.Database,
  workspaceId: string,
  threadId?: string,
): number {
  const decisions = extractProjectDecisions(db, workspaceId, threadId);
  const openQuestions = extractOpenQuestions(db, workspaceId, threadId);
  const messageCount = threadId
    ? (
        db
          .prepare("SELECT COUNT(*) AS c FROM messages WHERE thread_id = ?")
          .get(threadId) as { c: number }
      ).c
    : (
        db
          .prepare(
            `SELECT COUNT(*) AS c FROM messages m
             JOIN threads t ON t.id = m.thread_id
             WHERE t.workspace_id = ?`,
          )
          .get(workspaceId) as { c: number }
      ).c;

  const decisionWeight =
    decisions.reduce((sum, row) => sum + row.scores.continuityScore, 0) /
    Math.max(1, decisions.length);
  const openWeight =
    openQuestions.filter((q) => q.status === "open").length > 0 ? 0.08 : 0.14;
  const coverage = Math.min(1, Math.log10(messageCount + 10) / 3);
  const score = Number(
    Math.min(0.99, coverage * 0.35 + decisionWeight * 0.45 + openWeight + 0.08).toFixed(3),
  );
  return score;
}

export function calculateContinuityHealthMetrics(
  db: Database.Database,
  workspaceId: string,
  threadId?: string,
): ContinuityHealthMetrics {
  const primaryThread =
    threadId ??
    (
      db
        .prepare(
          `SELECT id FROM threads WHERE workspace_id = ? ORDER BY updated_at DESC LIMIT 1`,
        )
        .get(workspaceId) as { id: string } | undefined
    )?.id;

  const decisions = extractProjectDecisions(db, workspaceId, threadId);
  const openQuestions = extractOpenQuestions(db, workspaceId, threadId);
  const messageCount = primaryThread
    ? (
        db
          .prepare("SELECT COUNT(*) AS c FROM messages WHERE thread_id = ?")
          .get(primaryThread) as { c: number }
      ).c
    : 0;
  const fragmentCount = primaryThread
    ? (
        db
          .prepare(
            "SELECT COUNT(*) AS c FROM memory_fragments WHERE workspace_id = ? AND thread_id = ?",
          )
          .get(workspaceId, primaryThread) as { c: number }
      ).c
    : 0;

  let rebuildConfidence = 0.5;
  if (primaryThread) {
    const reconstruction = scoreContinuityReconstruction(db, {
      workspaceId,
      threadId: primaryThread,
      query: "continuity rebuild health",
    });
    rebuildConfidence = reconstruction.continuityReconstructionHealth;
  }

  const continuityCoverage = Math.min(1, messageCount / Math.max(20, messageCount));
  const continuityConfidence = calculateContinuityScore(db, workspaceId, threadId);
  const projectAwareness = Math.min(
    1,
    (decisions.filter((d) => d.scores.projectScore >= 0.7).length +
      fragmentCount * 0.02) /
      5,
  );
  const decisionCoverage = Math.min(1, decisions.length / Math.max(3, messageCount / 40));
  const openQuestionCoverage = Math.min(
    1,
    openQuestions.filter((q) => q.status === "open").length / Math.max(1, openQuestions.length),
  );

  return {
    continuityCoverage: Number(continuityCoverage.toFixed(3)),
    continuityConfidence: Number(continuityConfidence.toFixed(3)),
    rebuildConfidence: Number(rebuildConfidence.toFixed(3)),
    projectAwareness: Number(projectAwareness.toFixed(3)),
    decisionCoverage: Number(decisionCoverage.toFixed(3)),
    openQuestionCoverage: Number(openQuestionCoverage.toFixed(3)),
  };
}

function persistHealthMetrics(
  db: Database.Database,
  workspaceId: string,
  threadId: string | null,
  metrics: ContinuityHealthMetrics,
): void {
  db.prepare(
    `INSERT INTO continuity_health_metrics (
      id, workspace_id, thread_id, continuity_coverage, continuity_confidence,
      rebuild_confidence, project_awareness, decision_coverage, open_question_coverage,
      metrics_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    uuid(),
    workspaceId,
    threadId,
    metrics.continuityCoverage,
    metrics.continuityConfidence,
    metrics.rebuildConfidence,
    metrics.projectAwareness,
    metrics.decisionCoverage,
    metrics.openQuestionCoverage,
    JSON.stringify(metrics),
    new Date().toISOString(),
  );
}

export function generateProjectTimeline(
  db: Database.Database,
  workspaceId: string,
): TimelineEvent[] {
  const ws = db
    .prepare("SELECT id, name, created_at FROM workspaces WHERE id = ?")
    .get(workspaceId) as { id: string; name: string; created_at: string } | undefined;
  if (!ws) return [];

  const events: TimelineEvent[] = [
    {
      id: `ws-${ws.id}`,
      title: "Project Created",
      description: `Workspace "${ws.name}" created.`,
      occurredAt: ws.created_at,
      significance: "high",
      source: "workspace",
    },
  ];

  const decisions = extractProjectDecisions(db, workspaceId);
  for (const decision of decisions.slice(0, 40)) {
    events.push({
      id: decision.id,
      title: decision.title,
      description: decision.description,
      occurredAt: `${decision.decidedAt}-01T00:00:00.000Z`,
      significance: decision.scores.importanceTier,
      source: "decision",
    });
  }

  const timelineRows = db
    .prepare(
      `SELECT id, title, description, created_at, event_type FROM timeline_events
       WHERE workspace_id = ?
       ORDER BY created_at ASC
       LIMIT 120`,
    )
    .all(workspaceId) as Array<{
    id: string;
    title: string;
    description: string | null;
    created_at: string;
    event_type: string;
  }>;

  for (const row of timelineRows) {
    events.push({
      id: row.id,
      title: row.title,
      description: row.description ?? row.event_type,
      occurredAt: row.created_at,
      significance: "medium",
      source: "timeline",
    });
  }

  return events.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
}

function buildSnapshotMarkdown(snapshot: Omit<ContinuitySnapshot, "markdown">): string {
  const lines = [
    "# Continuity Snapshot",
    "",
    `Workspace: ${snapshot.workspaceName}`,
    `Generated: ${snapshot.generatedAt}`,
    `Continuity score: ${Math.round(snapshot.continuityScore * 100)}%`,
    "",
    "## Current Objective",
    snapshot.currentObjective ?? "Not captured yet.",
    "",
    "## Recent Decisions",
    ...(snapshot.recentDecisions.length > 0
      ? snapshot.recentDecisions.map((item) => `- ${item}`)
      : ["- None recorded yet."]),
    "",
    "## Open Questions",
    ...(snapshot.openQuestions.length > 0
      ? snapshot.openQuestions.map((item) => `- ${item}`)
      : ["- None recorded yet."]),
    "",
    "## Known Stable State",
    ...(snapshot.knownStableState.length > 0
      ? snapshot.knownStableState.map((item) => `- ${item}`)
      : ["- Conversation history is canonical source of truth."]),
    "",
    "## Current Risks",
    ...(snapshot.currentRisks.length > 0
      ? snapshot.currentRisks.map((item) => `- ${item}`)
      : ["- None flagged."]),
    "",
    "## Important Preferences",
    ...(snapshot.importantPreferences.length > 0
      ? snapshot.importantPreferences.map((item) => `- ${item}`)
      : ["- None recorded yet."]),
    "",
    "## Recent Progress",
    ...(snapshot.recentProgress.length > 0
      ? snapshot.recentProgress.map((item) => `- ${item}`)
      : ["- No recent progress captured."]),
  ];
  return lines.join("\n");
}

export function generateContinuitySnapshot(
  db: Database.Database,
  workspaceId: string,
): ContinuitySnapshot {
  const ws = db
    .prepare("SELECT id, name, continuity_summary FROM workspaces WHERE id = ?")
    .get(workspaceId) as
    | { id: string; name: string; continuity_summary: string | null }
    | undefined;
  if (!ws) throw new Error("Workspace not found.");

  const thread = db
    .prepare(
      `SELECT id FROM threads WHERE workspace_id = ? ORDER BY updated_at DESC LIMIT 1`,
    )
    .get(workspaceId) as { id: string } | undefined;

  const decisions = extractProjectDecisions(db, workspaceId);
  const openQuestions = extractOpenQuestions(db, workspaceId);
  const state = thread ? getMemoryState(db, workspaceId, thread.id) : null;
  const signals = thread
    ? extractContinuitySignals(db, { workspaceId, threadId: thread.id, limit: 200 })
    : [];
  const continuityScore = calculateContinuityScore(db, workspaceId, thread?.id);
  const generatedAt = new Date().toISOString();

  const snapshotBody: Omit<ContinuitySnapshot, "markdown"> = {
    workspaceId,
    workspaceName: ws.name,
    generatedAt,
    continuityScore,
    currentObjective:
      ws.continuity_summary?.trim() ||
      state?.currentGoals[0] ||
      null,
    recentDecisions: decisions.slice(0, 8).map((d) => d.description),
    openQuestions: openQuestions
      .filter((q) => q.status === "open")
      .slice(0, 8)
      .map((q) => q.question),
    knownStableState: [
      ...(state?.importantFacts.slice(0, 4) ?? []),
      ...(state?.decisions.slice(0, 3) ?? []),
    ],
    currentRisks: signals
      .filter((s) => s.kind === "unresolved_work" || RISK_RE.test(s.content))
      .slice(0, 5)
      .map((s) => s.content),
    importantPreferences: state?.userPreferences.slice(0, 6) ?? [],
    recentProgress: signals
      .filter((s) => s.kind === "milestone" || s.kind === "change")
      .slice(0, 6)
      .map((s) => s.content),
  };

  const snapshot: ContinuitySnapshot = {
    ...snapshotBody,
    markdown: buildSnapshotMarkdown(snapshotBody),
  };

  db.prepare(
    `INSERT INTO continuity_intelligence_snapshots (
      id, workspace_id, snapshot_json, snapshot_markdown, continuity_score, generated_at
    ) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    uuid(),
    workspaceId,
    JSON.stringify(snapshotBody),
    snapshot.markdown,
    continuityScore,
    generatedAt,
  );

  return snapshot;
}

export function analyzeConversation(
  db: Database.Database,
  workspaceId: string,
  threadId: string,
): ConversationAnalysis {
  updateFragmentScores(db, workspaceId, threadId);
  const signals = extractContinuitySignals(db, { workspaceId, threadId, limit: 800 });
  const decisions = extractProjectDecisions(db, workspaceId, threadId);
  const openQuestions = extractOpenQuestions(db, workspaceId, threadId);
  const milestones = generateProjectTimeline(db, workspaceId).filter(
    (event) => event.source === "decision" || event.source === "milestone",
  );
  const continuityScore = calculateContinuityScore(db, workspaceId, threadId);
  const health = calculateContinuityHealthMetrics(db, workspaceId, threadId);
  persistHealthMetrics(db, workspaceId, threadId, health);

  return {
    signals,
    decisions,
    openQuestions,
    milestones,
    continuityScore,
    health,
  };
}

export function analyzeConversationNonBlocking(
  db: Database.Database,
  input: { workspaceId: string; threadId: string },
): void {
  try {
    analyzeConversation(db, input.workspaceId, input.threadId);
  } catch (error) {
    console.warn("[continuity] intelligence analysis skipped", error);
  }
}

/** Lightweight per-message intelligence extraction (safe on high-volume inserts). */
export function incrementalIntelligenceFromMessage(
  db: Database.Database,
  input: {
    workspaceId: string;
    threadId: string;
    messageId: string;
    role: MessageRole;
    content: string;
    createdAt: string;
  },
): void {
  try {
    for (const sentence of sentenceCandidates(input.content)) {
      const kind = classifySentence(sentence, input.role);
      if (!kind) continue;
      const scores = scoreContinuityItem({ kind, content: sentence, role: input.role });
      if (kind === "decision" || kind === "milestone" || kind === "change") {
        upsertDecisionRecord(db, {
          workspaceId: input.workspaceId,
          threadId: input.threadId,
          sourceMessageId: input.messageId,
          title: truncate(sentence, 80),
          description: sentence,
          decidedAt: monthKey(input.createdAt),
          scores,
        });
      } else if (
        kind === "open_question" ||
        kind === "unresolved_work" ||
        (kind === "important_event" && /\?/.test(sentence))
      ) {
        upsertOpenQuestionRecord(db, {
          workspaceId: input.workspaceId,
          threadId: input.threadId,
          sourceMessageId: input.messageId,
          question: sentence,
          lastDiscussedAt: input.createdAt,
          scores,
        });
      }
    }
  } catch (error) {
    console.warn("[continuity] incremental intelligence skipped", error);
  }
}

export function rebuildIntelligenceFromHistory(
  db: Database.Database,
  workspaceId: string,
): {
  rebuiltThreads: number;
  rebuiltDecisions: number;
  rebuiltOpenQuestions: number;
  continuityScore: number;
} {
  db.prepare("DELETE FROM continuity_decision_records WHERE workspace_id = ?").run(workspaceId);
  db.prepare("DELETE FROM continuity_open_question_records WHERE workspace_id = ?").run(
    workspaceId,
  );
  db.prepare("DELETE FROM continuity_intelligence_snapshots WHERE workspace_id = ?").run(
    workspaceId,
  );
  db.prepare("DELETE FROM continuity_health_metrics WHERE workspace_id = ?").run(workspaceId);

  const threads = db
    .prepare("SELECT id FROM threads WHERE workspace_id = ?")
    .all(workspaceId) as Array<{ id: string }>;

  let rebuiltThreads = 0;
  for (const thread of threads) {
    rebuildDerivedMemoryFromCanonical(db, { workspaceId, threadId: thread.id });
    analyzeConversation(db, workspaceId, thread.id);
    rebuiltThreads += 1;
  }

  const decisions = extractProjectDecisions(db, workspaceId);
  const openQuestions = extractOpenQuestions(db, workspaceId);
  return {
    rebuiltThreads,
    rebuiltDecisions: decisions.length,
    rebuiltOpenQuestions: openQuestions.length,
    continuityScore: calculateContinuityScore(db, workspaceId),
  };
}

export function simulateIntelligenceLossAndRebuild(
  db: Database.Database,
  workspaceId: string,
  threadId: string,
): {
  beforeScore: number;
  afterCorruptionScore: number;
  afterRebuildScore: number;
  decisionsRecovered: number;
  openQuestionsRecovered: number;
  rebuildSuccessful: boolean;
} {
  analyzeConversation(db, workspaceId, threadId);
  const beforeScore = calculateContinuityScore(db, workspaceId, threadId);

  db.prepare("DELETE FROM memory_fragments WHERE workspace_id = ? AND thread_id = ?").run(
    workspaceId,
    threadId,
  );
  db.prepare("DELETE FROM memory_states WHERE workspace_id = ? AND thread_id = ?").run(
    workspaceId,
    threadId,
  );
  db.prepare("DELETE FROM continuity_decision_records WHERE workspace_id = ?").run(workspaceId);
  db.prepare("DELETE FROM continuity_open_question_records WHERE workspace_id = ?").run(
    workspaceId,
  );

  const afterCorruptionScore = calculateContinuityScore(db, workspaceId, threadId);
  const rebuilt = rebuildIntelligenceFromHistory(db, workspaceId);
  const afterRebuildScore = rebuilt.continuityScore;

  return {
    beforeScore,
    afterCorruptionScore,
    afterRebuildScore,
    decisionsRecovered: rebuilt.rebuiltDecisions,
    openQuestionsRecovered: rebuilt.rebuiltOpenQuestions,
    rebuildSuccessful: afterRebuildScore >= beforeScore * 0.75,
  };
}

export function runScaleSimulation(
  db: Database.Database,
  input: {
    workspaceId: string;
    threadId: string;
    messageCount: number;
    label: string;
  },
): {
  messageCount: number;
  rebuildSuccess: boolean;
  timelineEvents: number;
  decisionsExtracted: number;
  continuityScore: number;
  memoryDrift: number;
} {
  const scanLimit = Math.min(input.messageCount, 12_000);
  const insert = db.prepare(
    `INSERT INTO messages (id, thread_id, role, content, message_status, created_at)
     VALUES (?, ?, ?, ?, 'completed', ?)`,
  );
  const insertBatch = db.transaction((start: number, end: number) => {
    for (let i = start; i < end; i += 1) {
      const content =
        i % 17 === 0
          ? `Decision ${i}: ${input.label} architecture changed for continuity intelligence.`
          : i % 23 === 0
            ? `Open question ${i}: should we defer ${input.label} until later?`
            : i % 31 === 0
              ? `Milestone ${i}: ${input.label} layer implemented.`
              : `${input.label} message ${i}: continuity intelligence scale simulation payload.`;
      insert.run(
        uuid(),
        input.threadId,
        i % 2 === 0 ? "user" : "assistant",
        content,
        new Date(Date.now() + i * 1000).toISOString(),
      );
    }
  });

  for (let start = 0; start < input.messageCount; start += 1000) {
    insertBatch(start, Math.min(input.messageCount, start + 1000));
  }

  db.prepare("DELETE FROM continuity_decision_records WHERE workspace_id = ?").run(input.workspaceId);
  db.prepare("DELETE FROM continuity_open_question_records WHERE workspace_id = ?").run(
    input.workspaceId,
  );

  const signals = extractContinuitySignals(db, {
    workspaceId: input.workspaceId,
    threadId: input.threadId,
    limit: scanLimit,
  });
  for (const signal of signals.filter(
    (row) => row.kind === "decision" || row.kind === "milestone" || row.kind === "change",
  )) {
    upsertDecisionRecord(db, {
      workspaceId: input.workspaceId,
      threadId: signal.threadId,
      sourceMessageId: signal.sourceMessageId,
      title: truncate(signal.content, 80),
      description: signal.content,
      decidedAt: monthKey(signal.discussedAt),
      scores: signal.scores,
    });
  }
  for (const signal of signals.filter(
    (row) =>
      row.kind === "open_question" ||
      row.kind === "unresolved_work" ||
      (row.kind === "important_event" && /\?/.test(row.content)),
  )) {
    upsertOpenQuestionRecord(db, {
      workspaceId: input.workspaceId,
      threadId: signal.threadId,
      sourceMessageId: signal.sourceMessageId,
      question: signal.content,
      lastDiscussedAt: signal.discussedAt,
      scores: signal.scores,
    });
  }

  if (input.messageCount <= 2500) {
    rebuildDerivedMemoryFromCanonical(db, {
      workspaceId: input.workspaceId,
      threadId: input.threadId,
    });
  }

  const timeline = generateProjectTimeline(db, input.workspaceId);
  const decisions = extractProjectDecisions(db, input.workspaceId, input.threadId);
  const continuityScore = calculateContinuityScore(db, input.workspaceId, input.threadId);
  const reconstruction = scoreContinuityReconstruction(db, {
    workspaceId: input.workspaceId,
    threadId: input.threadId,
    query: input.label,
  });

  return {
    messageCount: input.messageCount,
    rebuildSuccess: decisions.length > 0,
    timelineEvents: timeline.length,
    decisionsExtracted: decisions.length,
    continuityScore,
    memoryDrift: reconstruction.continuityDriftScore,
  };
}

export function buildContinuityIntelligenceExport(
  db: Database.Database,
  workspaceId: string,
): ContinuityIntelligenceExport {
  const decisions = extractProjectDecisions(db, workspaceId);
  const openQuestions = extractOpenQuestions(db, workspaceId);
  const timeline = generateProjectTimeline(db, workspaceId);
  const health = calculateContinuityHealthMetrics(db, workspaceId);

  let latestSnapshot: ContinuitySnapshot | null = null;
  const row = db
    .prepare(
      `SELECT snapshot_json FROM continuity_intelligence_snapshots
       WHERE workspace_id = ? ORDER BY generated_at DESC LIMIT 1`,
    )
    .get(workspaceId) as { snapshot_json: string } | undefined;
  if (row) {
    try {
      const parsed = JSON.parse(row.snapshot_json) as Omit<ContinuitySnapshot, "markdown">;
      latestSnapshot = {
        ...parsed,
        markdown: buildSnapshotMarkdown(parsed),
      };
    } catch {
      latestSnapshot = null;
    }
  }

  return {
    version: 1,
    decisions,
    openQuestions,
    latestSnapshot,
    timeline,
    health,
  };
}

export function importContinuityIntelligenceExport(
  db: Database.Database,
  workspaceId: string,
  payload: ContinuityIntelligenceExport,
): void {
  if (!payload || payload.version !== 1) return;

  for (const decision of payload.decisions ?? []) {
    upsertDecisionRecord(db, {
      workspaceId,
      threadId: decision.threadId,
      sourceMessageId: decision.sourceMessageId,
      title: decision.title,
      description: decision.description,
      decidedAt: decision.decidedAt,
      scores: decision.scores,
    });
  }

  for (const question of payload.openQuestions ?? []) {
    upsertOpenQuestionRecord(db, {
      workspaceId,
      threadId: question.threadId,
      sourceMessageId: question.sourceMessageId,
      question: question.question,
      lastDiscussedAt: question.lastDiscussedAt,
      scores: question.scores,
      status: question.status,
    });
  }

  if (payload.latestSnapshot) {
    db.prepare(
      `INSERT INTO continuity_intelligence_snapshots (
        id, workspace_id, snapshot_json, snapshot_markdown, continuity_score, generated_at
      ) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      uuid(),
      workspaceId,
      JSON.stringify({
        ...payload.latestSnapshot,
        markdown: undefined,
      }),
      payload.latestSnapshot.markdown,
      payload.latestSnapshot.continuityScore,
      payload.latestSnapshot.generatedAt,
    );
  }

  if (payload.health) {
    persistHealthMetrics(db, workspaceId, null, payload.health);
  }
}
