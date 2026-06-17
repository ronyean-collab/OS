import { v4 as uuid } from "uuid";
import type Database from "better-sqlite3";
import {
  LEGACY_CONTINUITY_IMPORT_HEADER,
  MARKDOWN_MEMORY_HEADER,
  MARKDOWN_MEMORY_VERSION,
} from "../../../src/shared/markdown-memory-schema";
import type {
  ContinuityImportApplyResult,
  ContinuityImportMode,
  MarkdownMemoryFileType,
  MarkdownMemoryPreview,
  MarkdownMemoryRecordSummary,
  Workspace,
} from "../../../src/shared/types";
import { runInTransaction } from "../database/transactions";
import { appendTimelineEvent } from "./continuity-service";
import { MAX_CONTINUITY_SUMMARY_CHARS } from "./context-assembly";
import { getWorkspaceById } from "./workspace-service";

const APPLIED_RECORD_TYPE = "continuity_import_file_applied_v1";
const CHECKPOINT_RECORD_TYPE = "continuity_import_file_checkpoint_v1";
const GENERATED_RECORD_TYPE = "markdown_memory_generated_v1";
const ACCEPTED_CONTEXT_RECORD_TYPES = [
  APPLIED_RECORD_TYPE,
  CHECKPOINT_RECORD_TYPE,
] as const;

type ParsedContinuityImport = MarkdownMemoryPreview & {
  rawSource: string;
};

type StoredContinuityImportRecord = ParsedContinuityImport & {
  appliedAt: string;
  mode: ContinuityImportMode;
};

type ListSectionKey =
  | "stableFacts"
  | "recentProgress"
  | "decisionsMade"
  | "openIssues"
  | "nextSteps"
  | "testBuildGitStatus"
  | "risksWarnings"
  | "rulesForFutureAi";

type TextSectionKey =
  | "currentObjective"
  | "continuitySummary"
  | "importantContextForNextAi"
  | "recentConversationExcerpts";

const TEXT_SECTIONS: Record<string, TextSectionKey> = {
  "CURRENT OBJECTIVE": "currentObjective",
  "CONTINUITY SUMMARY": "continuitySummary",
  "IMPORTANT CONTEXT FOR NEXT AI": "importantContextForNextAi",
  "RECENT CONVERSATION EXCERPTS": "recentConversationExcerpts",
};

const LIST_SECTIONS: Record<string, ListSectionKey> = {
  "STABLE FACTS": "stableFacts",
  "RECENT PROGRESS": "recentProgress",
  "DECISIONS MADE": "decisionsMade",
  "OPEN ISSUES": "openIssues",
  "NEXT STEPS": "nextSteps",
  "TEST / BUILD / GIT STATUS": "testBuildGitStatus",
  "RISKS / WARNINGS": "risksWarnings",
  "RULES FOR FUTURE AI": "rulesForFutureAi",
};

function normalizeImportText(raw: string): string {
  return raw.replace(/\r\n?/g, "\n").trim();
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeUnknown(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "UNKNOWN";
}

function hasKnownValue(value: string | null | undefined): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  return Boolean(trimmed) && trimmed.toUpperCase() !== "UNKNOWN";
}

function limitString(value: string, maxChars: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, maxChars).trimEnd()}\n[truncated for context size]`;
}

function normalizeList(lines: string[]): string[] {
  const items: string[] = [];
  let current = "";

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const bulletMatch = /^[-*]\s+(.*)$/.exec(trimmed);
    const numberedMatch = /^\d+\.\s+(.*)$/.exec(trimmed);
    const nextChunk = bulletMatch?.[1] ?? numberedMatch?.[1] ?? trimmed;

    if (bulletMatch || numberedMatch) {
      if (current) {
        items.push(limitString(collapseWhitespace(current), 280));
      }
      current = nextChunk;
      continue;
    }

    current = current ? `${current} ${nextChunk}` : nextChunk;
  }

  if (current) {
    items.push(limitString(collapseWhitespace(current), 280));
  }

  return items.filter(Boolean);
}

function normalizeTextSection(lines: string[]): string {
  return normalizeUnknown(lines.join("\n").trim());
}

function normalizeFileType(raw: string | null | undefined): MarkdownMemoryFileType {
  const value = raw?.trim().toLowerCase();
  if (
    value === "continuity-import" ||
    value === "continuity-export" ||
    value === "ai-handoff" ||
    value === "thread-summary" ||
    value === "project-state"
  ) {
    return value;
  }
  return "continuity-import";
}

function buildEmptyPreview(rawSource = ""): ParsedContinuityImport {
  return {
    valid: false,
    fileType: "continuity-import",
    source: "UNKNOWN",
    version: null,
    sourceAi: "UNKNOWN",
    generatedAt: "UNKNOWN",
    projectName: "UNKNOWN",
    projectType: "UNKNOWN",
    currentObjective: "UNKNOWN",
    continuitySummary: "UNKNOWN",
    stableFacts: [],
    recentProgress: [],
    decisionsMade: [],
    openIssues: [],
    nextSteps: [],
    importantContextForNextAi: "UNKNOWN",
    recentConversationExcerpts: "UNKNOWN",
    testBuildGitStatus: [],
    risksWarnings: [],
    rulesForFutureAi: [],
    warnings: [],
    errors: [],
    rawSource,
  };
}

function detectHeader(firstNonEmptyLine: string): "memory" | "legacy-import" | null {
  const upper = firstNonEmptyLine.toUpperCase();
  if (upper === MARKDOWN_MEMORY_HEADER) return "memory";
  if (upper === LEGACY_CONTINUITY_IMPORT_HEADER) return "legacy-import";
  return null;
}

export function previewContinuityImportFile(raw: string): MarkdownMemoryPreview {
  return parseContinuityImportFile(raw);
}

export function parseContinuityImportFile(raw: string): ParsedContinuityImport {
  const normalized = normalizeImportText(raw);
  const preview = buildEmptyPreview(normalized);

  if (!normalized) {
    preview.errors.push("Import file is empty.");
    return preview;
  }

  const lines = normalized.split("\n");
  const firstNonEmptyIndex = lines.findIndex((line) => line.trim().length > 0);
  const firstNonEmptyLine = firstNonEmptyIndex >= 0 ? lines[firstNonEmptyIndex].trim() : "";
  const headerType = detectHeader(firstNonEmptyLine);
  if (!headerType) {
    preview.errors.push(
      "Missing `# CONTINUITYOS MEMORY FILE` header (legacy `# CONTINUITYOS IMPORT FILE` is also accepted).",
    );
    return preview;
  }

  const metadata = new Map<string, string>();
  const sectionBuffers = new Map<string, string[]>();
  let activeSection: string | null = null;

  for (const line of lines.slice(firstNonEmptyIndex + 1)) {
    const trimmed = line.trim();
    if (/^##\s+/.test(trimmed)) {
      activeSection = trimmed.slice(3).trim().toUpperCase();
      sectionBuffers.set(activeSection, []);
      continue;
    }

    if (!activeSection) {
      const metadataMatch = /^([a-z_]+)\s*:\s*(.*)$/i.exec(trimmed);
      if (metadataMatch) {
        metadata.set(metadataMatch[1].toLowerCase(), metadataMatch[2].trim());
      }
      continue;
    }

    sectionBuffers.get(activeSection)?.push(line);
  }

  const versionRaw = metadata.get("version") ?? "";
  if (!versionRaw) {
    preview.warnings.push("Missing version. Assuming version 1.");
    preview.version = MARKDOWN_MEMORY_VERSION;
  } else {
    const version = Number.parseInt(versionRaw, 10);
    if (Number.isNaN(version)) {
      preview.errors.push("Version must be a number.");
    } else {
      preview.version = version;
      if (version !== MARKDOWN_MEMORY_VERSION) {
        preview.errors.push(`Unsupported version ${version}.`);
      }
    }
  }

  preview.fileType =
    headerType === "legacy-import"
      ? "continuity-import"
      : normalizeFileType(metadata.get("file_type"));
  preview.source =
    headerType === "legacy-import"
      ? normalizeUnknown(metadata.get("source_ai"))
      : normalizeUnknown(metadata.get("source"));
  preview.sourceAi = preview.source;
  preview.generatedAt = normalizeUnknown(metadata.get("generated_at"));
  preview.projectName = normalizeUnknown(metadata.get("project_name"));
  preview.projectType = normalizeUnknown(metadata.get("project_type"));

  for (const [heading, key] of Object.entries(TEXT_SECTIONS)) {
    preview[key] = normalizeTextSection(sectionBuffers.get(heading) ?? []);
  }

  for (const [heading, key] of Object.entries(LIST_SECTIONS)) {
    preview[key] = normalizeList(sectionBuffers.get(heading) ?? []);
  }

  if (!hasKnownValue(preview.currentObjective) && !hasKnownValue(preview.continuitySummary)) {
    preview.warnings.push(
      "The markdown memory file is missing both a current objective and a continuity summary.",
    );
  }

  preview.valid = preview.errors.length === 0;
  return preview;
}

function truncateList(items: string[], limit = 6): string[] {
  return items.slice(0, limit).map((item) => limitString(item, 240));
}

function buildImportedSummaryBlock(parsed: ParsedContinuityImport): string {
  const blocks: string[] = [];
  if (hasKnownValue(parsed.currentObjective)) {
    blocks.push(`Current objective: ${limitString(parsed.currentObjective, 400)}`);
  }
  if (hasKnownValue(parsed.continuitySummary)) {
    blocks.push(limitString(parsed.continuitySummary, 1500));
  }
  if (parsed.nextSteps.length > 0) {
    blocks.push(`Next steps: ${truncateList(parsed.nextSteps, 4).join("; ")}`);
  }
  if (parsed.openIssues.length > 0) {
    blocks.push(`Open issues: ${truncateList(parsed.openIssues, 4).join("; ")}`);
  }
  return blocks.join("\n\n").trim();
}

function mergeContinuitySummary(
  existingSummary: string | null,
  parsed: ParsedContinuityImport,
  mode: ContinuityImportMode,
): string | null {
  const importedSummary = buildImportedSummaryBlock(parsed);
  if (!importedSummary) {
    return existingSummary?.trim() ? existingSummary.trim() : null;
  }

  if (mode === "create-workspace" || !existingSummary?.trim()) {
    return importedSummary.slice(0, MAX_CONTINUITY_SUMMARY_CHARS);
  }

  const importedHeader = `Imported markdown memory (${parsed.sourceAi}${
    hasKnownValue(parsed.generatedAt) ? `, ${parsed.generatedAt}` : ""
  }):`;
  const merged = `${existingSummary.trim()}\n\n${importedHeader}\n${importedSummary}`;
  return merged.slice(0, MAX_CONTINUITY_SUMMARY_CHARS);
}

function createWorkspaceFromImport(
  db: Database.Database,
  parsed: ParsedContinuityImport,
  summary: string | null,
): Workspace {
  const id = uuid();
  const now = new Date().toISOString();
  const name = hasKnownValue(parsed.projectName) ? parsed.projectName : "Imported markdown memory";
  db.prepare(
    `INSERT INTO workspaces (id, user_id, name, created_at, updated_at, last_opened_at, continuity_summary)
     VALUES (?, NULL, ?, ?, ?, ?, ?)`,
  ).run(id, name, now, now, now, summary);

  return {
    id,
    name,
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
    continuitySummary: summary,
  };
}

function buildRecordTitle(parsed: ParsedContinuityImport): string {
  const label = parsed.fileType.replace(/-/g, " ");
  if (hasKnownValue(parsed.projectName)) {
    return `${parsed.projectName} · ${label}`;
  }
  return label;
}

function insertContinuityImportRecord(
  db: Database.Database,
  workspaceId: string,
  parsed: ParsedContinuityImport,
  mode: ContinuityImportMode,
): void {
  const recordId = uuid();
  const appliedAt = new Date().toISOString();
  const recordType = mode === "checkpoint-only" ? CHECKPOINT_RECORD_TYPE : APPLIED_RECORD_TYPE;
  const payload: StoredContinuityImportRecord = {
    ...parsed,
    appliedAt,
    mode,
  };

  db.prepare(
    `INSERT INTO continuity_records (id, workspace_id, record_type, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(recordId, workspaceId, recordType, JSON.stringify(payload), appliedAt);
}

export function applyContinuityImportFile(
  db: Database.Database,
  input: {
    text: string;
    mode: ContinuityImportMode;
    workspaceId?: string | null;
  },
): ContinuityImportApplyResult {
  const parsed = parseContinuityImportFile(input.text);
  if (!parsed.valid) {
    return {
      ok: false,
      message: parsed.errors[0] ?? "Markdown memory file is not valid.",
      mode: input.mode,
      workspace: null,
      sourceAi: parsed.sourceAi,
      projectName: parsed.projectName,
    };
  }

  const mode = input.mode;
  if (mode !== "create-workspace" && !input.workspaceId?.trim()) {
    return {
      ok: false,
      message: "Select a workspace before applying this markdown memory file.",
      mode,
      workspace: null,
      sourceAi: parsed.sourceAi,
      projectName: parsed.projectName,
    };
  }

  const existingWorkspace =
    mode === "create-workspace" ? null : getWorkspaceById(db, input.workspaceId!.trim());
  if (mode !== "create-workspace" && !existingWorkspace) {
    return {
      ok: false,
      message: "Workspace not found.",
      mode,
      workspace: null,
      sourceAi: parsed.sourceAi,
      projectName: parsed.projectName,
    };
  }

  let workspace: Workspace | null = null;

  runInTransaction(db, () => {
    const mergedSummary =
      mode === "checkpoint-only"
        ? existingWorkspace?.continuitySummary ?? null
        : mergeContinuitySummary(existingWorkspace?.continuitySummary ?? null, parsed, mode);

    if (mode === "create-workspace") {
      workspace = createWorkspaceFromImport(db, parsed, mergedSummary);
    } else {
      const now = new Date().toISOString();
      db.prepare(
        "UPDATE workspaces SET continuity_summary = ?, updated_at = ? WHERE id = ?",
      ).run(mergedSummary, now, existingWorkspace!.id);
      workspace = getWorkspaceById(db, existingWorkspace!.id);
    }

    insertContinuityImportRecord(db, workspace!.id, parsed, mode);

    const counts = [
      parsed.stableFacts.length > 0 ? `${parsed.stableFacts.length} facts` : null,
      parsed.decisionsMade.length > 0 ? `${parsed.decisionsMade.length} decisions` : null,
      parsed.openIssues.length > 0 ? `${parsed.openIssues.length} open issues` : null,
      parsed.nextSteps.length > 0 ? `${parsed.nextSteps.length} next steps` : null,
    ]
      .filter(Boolean)
      .join(", ");
    const modeLabel =
      mode === "create-workspace"
        ? "new workspace"
        : mode === "checkpoint-only"
          ? "checkpoint only"
          : "current workspace";

    appendTimelineEvent(db, {
      workspaceId: workspace!.id,
      type: "continuity_import_file_applied",
      title: "Markdown memory imported",
      description: `Applied ${parsed.sourceAi} ${parsed.fileType} to ${modeLabel}${
        counts ? ` with ${counts}` : ""
      }.`,
      source: "user",
    });
  });

  const targetWorkspace =
    workspace ??
    (mode === "create-workspace"
      ? null
      : getWorkspaceById(db, input.workspaceId!.trim()));

  return {
    ok: true,
    message:
      mode === "checkpoint-only"
        ? "Markdown memory imported as a checkpoint. Future Context Packs will include this project state."
        : mode === "create-workspace"
          ? "Markdown memory imported into a new workspace."
          : "Markdown memory imported. Future Context Packs will include this project state.",
    mode,
    workspace: targetWorkspace,
    sourceAi: parsed.sourceAi,
    projectName: parsed.projectName,
  };
}

function coerceStoredImport(value: unknown): ParsedContinuityImport | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const stableFacts = Array.isArray(record.stableFacts)
    ? record.stableFacts.map((item) => String(item))
    : [];
  const recentProgress = Array.isArray(record.recentProgress)
    ? record.recentProgress.map((item) => String(item))
    : [];
  const decisionsMade = Array.isArray(record.decisionsMade)
    ? record.decisionsMade.map((item) => String(item))
    : [];
  const openIssues = Array.isArray(record.openIssues)
    ? record.openIssues.map((item) => String(item))
    : [];
  const nextSteps = Array.isArray(record.nextSteps)
    ? record.nextSteps.map((item) => String(item))
    : [];
  const testBuildGitStatus = Array.isArray(record.testBuildGitStatus)
    ? record.testBuildGitStatus.map((item) => String(item))
    : [];
  const risksWarnings = Array.isArray(record.risksWarnings)
    ? record.risksWarnings.map((item) => String(item))
    : [];
  const rulesForFutureAi = Array.isArray(record.rulesForFutureAi)
    ? record.rulesForFutureAi.map((item) => String(item))
    : [];

  const fileType = normalizeFileType(String(record.fileType ?? record.file_type ?? "continuity-import"));
  const source = normalizeUnknown(String(record.source ?? record.sourceAi ?? "UNKNOWN"));

  return {
    valid: true,
    fileType,
    source,
    version:
      typeof record.version === "number" ? record.version : MARKDOWN_MEMORY_VERSION,
    sourceAi: source,
    generatedAt: normalizeUnknown(String(record.generatedAt ?? "UNKNOWN")),
    projectName: normalizeUnknown(String(record.projectName ?? "UNKNOWN")),
    projectType: normalizeUnknown(String(record.projectType ?? "UNKNOWN")),
    currentObjective: normalizeUnknown(String(record.currentObjective ?? "UNKNOWN")),
    continuitySummary: normalizeUnknown(String(record.continuitySummary ?? "UNKNOWN")),
    stableFacts,
    recentProgress,
    decisionsMade,
    openIssues,
    nextSteps,
    importantContextForNextAi: normalizeUnknown(
      String(record.importantContextForNextAi ?? "UNKNOWN"),
    ),
    recentConversationExcerpts: normalizeUnknown(
      String(record.recentConversationExcerpts ?? "UNKNOWN"),
    ),
    testBuildGitStatus,
    risksWarnings,
    rulesForFutureAi,
    warnings: [],
    errors: [],
    rawSource: String(record.rawSource ?? ""),
  };
}

export function getLatestAppliedContinuityImport(
  db: Database.Database,
  workspaceId: string,
): ParsedContinuityImport | null {
  const placeholders = ACCEPTED_CONTEXT_RECORD_TYPES.map(() => "?").join(", ");
  const row = db
    .prepare(
      `SELECT payload_json
       FROM continuity_records
       WHERE workspace_id = ? AND record_type IN (${placeholders})
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
    )
    .get(workspaceId, ...ACCEPTED_CONTEXT_RECORD_TYPES) as { payload_json: string } | undefined;

  if (!row?.payload_json) return null;
  try {
    return coerceStoredImport(JSON.parse(row.payload_json) as unknown);
  } catch {
    return null;
  }
}


export function listStructuredMemoryEventRecords(
  db: Database.Database,
  workspaceId: string,
  limit = 20,
): Array<{
  id: string;
  workspaceId: string;
  createdAt: string;
  markdown: string;
  parsed: Record<string, unknown>;
}> {
  const rows = db
    .prepare(
      `SELECT id, workspace_id, payload_json, created_at
       FROM continuity_records
       WHERE workspace_id = ? AND record_type = ?
       ORDER BY created_at DESC, id DESC
       LIMIT ?`,
    )
    .all(workspaceId, "structured_memory_event_v1", limit) as Array<{
      id: string;
      workspace_id: string;
      payload_json: string;
      created_at: string;
    }>;

  return rows.flatMap((row) => {
    try {
      const payload = JSON.parse(row.payload_json) as {
        markdown?: unknown;
        parsed?: unknown;
      };

      const markdown = typeof payload.markdown === "string" ? payload.markdown : "";
      if (!markdown.trim()) return [];

      return [
        {
          id: row.id,
          workspaceId: row.workspace_id,
          createdAt: row.created_at,
          markdown,
          parsed:
            payload.parsed && typeof payload.parsed === "object"
              ? (payload.parsed as Record<string, unknown>)
              : {},
        },
      ];
    } catch {
      return [];
    }
  });
}

export function listMarkdownMemoryRecords(
  db: Database.Database,
  workspaceId: string,
  limit = 12,
): MarkdownMemoryRecordSummary[] {
  const rows = db
    .prepare(
      `SELECT id, workspace_id, payload_json, created_at
       FROM continuity_records
       WHERE workspace_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT ?`,
    )
    .all(workspaceId, limit) as Array<{
      id: string;
      workspace_id: string;
      payload_json: string;
      created_at: string;
    }>;

  return rows.flatMap((row) => {
    try {
      const parsed = coerceStoredImport(JSON.parse(row.payload_json) as unknown);
      if (!parsed) return [];
      return [
        {
          id: row.id,
          workspaceId: row.workspace_id,
          fileType: parsed.fileType,
          source: parsed.source,
          sourceAi: parsed.sourceAi,
          title: buildRecordTitle(parsed),
          projectName: parsed.projectName,
          currentObjective: parsed.currentObjective,
          continuitySummary: parsed.continuitySummary,
          decisionsMade: parsed.decisionsMade,
          openIssues: parsed.openIssues,
          nextSteps: parsed.nextSteps,
          createdAt: row.created_at,
          rawMarkdown: parsed.rawSource,
        },
      ];
    } catch {
      return [];
    }
  });
}

function formatListBlock(title: string, items: string[], maxItems = 6): string[] {
  if (items.length === 0) return [];
  return [title, ...truncateList(items, maxItems).map((item) => `- ${item}`), ""];
}

export function buildImportedStateContextBlock(parsed: ParsedContinuityImport | null): string | null {
  if (!parsed) return null;

  const lines: string[] = [];
  if (hasKnownValue(parsed.projectName)) {
    lines.push(`Imported project: ${parsed.projectName}`);
  }
  if (hasKnownValue(parsed.projectType)) {
    lines.push(`Project type: ${parsed.projectType}`);
  }
  if (hasKnownValue(parsed.fileType)) {
    lines.push(`Memory file type: ${parsed.fileType}`);
  }
  if (hasKnownValue(parsed.sourceAi)) {
    lines.push(`Source: ${parsed.sourceAi}`);
  }
  if (hasKnownValue(parsed.currentObjective)) {
    lines.push(`Current objective: ${limitString(parsed.currentObjective, 500)}`);
  }
  if (hasKnownValue(parsed.continuitySummary)) {
    lines.push(`Continuity summary:\n${limitString(parsed.continuitySummary, 1400)}`);
  }
  if (parsed.stableFacts.length > 0) {
    lines.push(`Stable facts: ${truncateList(parsed.stableFacts, 5).join("; ")}`);
  }
  if (parsed.decisionsMade.length > 0) {
    lines.push(`Decisions made: ${truncateList(parsed.decisionsMade, 5).join("; ")}`);
  }
  if (parsed.openIssues.length > 0) {
    lines.push(`Open issues: ${truncateList(parsed.openIssues, 5).join("; ")}`);
  }
  if (parsed.nextSteps.length > 0) {
    lines.push(`Next steps: ${truncateList(parsed.nextSteps, 5).join("; ")}`);
  }
  if (hasKnownValue(parsed.importantContextForNextAi)) {
    lines.push(
      `Important context for next AI:\n${limitString(parsed.importantContextForNextAi, 900)}`,
    );
  }
  if (hasKnownValue(parsed.recentConversationExcerpts)) {
    lines.push(
      `Recent useful excerpts:\n${limitString(parsed.recentConversationExcerpts, 900)}`,
    );
  }

  const block = lines.join("\n\n").trim();
  return block || null;
}

export function buildImportedStateContextPackSections(
  parsed: ParsedContinuityImport | null,
): string[] {
  if (!parsed) return [];

  const sections: string[] = [
    "## Markdown Memory / Project State",
    `File type: ${parsed.fileType}`,
    `Source: ${parsed.sourceAi}`,
    `Project name: ${parsed.projectName}`,
    `Project type: ${parsed.projectType}`,
    `Generated at: ${parsed.generatedAt}`,
    `Current objective: ${parsed.currentObjective}`,
    "",
  ];

  sections.push(...formatListBlock("## Stable Facts", parsed.stableFacts));
  sections.push(...formatListBlock("## Decisions Made", parsed.decisionsMade));
  sections.push(...formatListBlock("## Open Issues", parsed.openIssues));
  sections.push(...formatListBlock("## Next Steps", parsed.nextSteps));

  if (
    hasKnownValue(parsed.continuitySummary) ||
    parsed.recentProgress.length > 0 ||
    parsed.testBuildGitStatus.length > 0
  ) {
    sections.push("## Latest Known Status");
    if (hasKnownValue(parsed.continuitySummary)) {
      sections.push(limitString(parsed.continuitySummary, 1800));
    }
    for (const line of truncateList(parsed.recentProgress, 4)) {
      sections.push(`- ${line}`);
    }
    for (const line of truncateList(parsed.testBuildGitStatus, 4)) {
      sections.push(`- ${line}`);
    }
    sections.push("");
  }

  if (hasKnownValue(parsed.importantContextForNextAi)) {
    sections.push("## Important Context For Next AI");
    sections.push(limitString(parsed.importantContextForNextAi, 1400));
    sections.push("");
  }

  if (hasKnownValue(parsed.recentConversationExcerpts)) {
    sections.push("## Recent Useful Excerpts");
    sections.push(limitString(parsed.recentConversationExcerpts, 1200));
    sections.push("");
  }

  if (parsed.risksWarnings.length > 0) {
    sections.push(...formatListBlock("## Risks / Warnings", parsed.risksWarnings, 5));
  }

  if (parsed.rulesForFutureAi.length > 0) {
    sections.push(...formatListBlock("## Rules For Future AI", parsed.rulesForFutureAi, 5));
  }

  return sections.filter((section, index, all) => {
    if (section !== "") return true;
    return all[index - 1] !== "";
  });
}

export {
  ACCEPTED_CONTEXT_RECORD_TYPES,
  GENERATED_RECORD_TYPE,
};
