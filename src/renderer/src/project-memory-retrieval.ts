export type StructuredMemoryRetrievalEvent = {
  id: string;
  title: string;
  markdown: string;
  latestUserIntent: string;
  latestPolarisResult: string;
  digitalScentTrace: string;
  retrievalPhrases: string[];
  scentTags: string[];
  confidence: string;
  importanceScore: number;
};

export type StructuredMemoryRetrievalResult = {
  event: StructuredMemoryRetrievalEvent;
  score: number;
  matchedSignals: string[];
};

export type StructuredMemoryRetrievalResponse = {
  query: string;
  isVagueReference: boolean;
  results: StructuredMemoryRetrievalResult[];
  summary: string;
};

const VAGUE_REFERENCE_PATTERNS = [
  "that",
  "this",
  "the thing",
  "the issue",
  "the bug",
  "the problem",
  "the phase",
  "the memory",
  "the build",
  "the error",
  "the latest",
  "where we left off",
  "what we just did",
  "continue from there"
];

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "but",
  "by",
  "for",
  "from",
  "i",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "this",
  "to",
  "we",
  "what",
  "where",
  "with",
  "you"
]);

function normalizeText(value: unknown): string {
  if (typeof value !== "string") return "";

  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function stableHash(value: string): string {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash.toString(16).padStart(8, "0");
}

function tokenize(value: string): string[] {
  return normalizeText(value)
    .split(/[^a-z0-9_.:-]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
}

function uniqueList(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

function readMarkdownLine(markdown: string, labels: string[]): string {
  const lines = markdown.split(/\r?\n/);

  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`^-\\s*${escaped}:\\s*(.+)$`, "i");
    const match = lines.map((line) => line.trim()).find((line) => pattern.test(line));
    const value = match?.match(pattern)?.[1]?.trim();

    if (value) return value;
  }

  return "UNKNOWN";
}

function readCommaList(markdown: string, labels: string[]): string[] {
  const raw = readMarkdownLine(markdown, labels);

  if (!raw || raw === "UNKNOWN" || raw.toLowerCase() === "none") return [];

  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function readImportanceScore(markdown: string): number {
  const raw = readMarkdownLine(markdown, ["Importance score", "importance_score", "Importance"]);

  const match = raw.match(/\d+/);
  if (!match) return 0;

  return Math.max(0, Math.min(100, Number(match[0])));
}

function eventSearchText(event: StructuredMemoryRetrievalEvent): string {
  return [
    event.title,
    event.markdown,
    event.latestUserIntent,
    event.latestPolarisResult,
    event.digitalScentTrace,
    event.retrievalPhrases.join(" "),
    event.scentTags.join(" "),
    event.confidence
  ].join(" ");
}

export function isStructuredMemoryVagueReference(query: string): boolean {
  const normalized = normalizeText(query);

  if (!normalized) return false;

  return VAGUE_REFERENCE_PATTERNS.some((pattern) => normalized.includes(pattern));
}

export function extractStructuredMemoryEventMarkdownSections(
  summary: string | null | undefined
): string[] {
  const text = summary?.trim() ?? "";

  if (!text) return [];

  const matches = [...text.matchAll(/(?:^|\n)## Structured Memory Event\n([\s\S]*?)(?=\n## Structured Memory Event\n|\n## Latest Local State\n|\n## Retrieval Context Snapshot\n|\n## RESTORED_PROJECT_MEMORY\n|$)/g)];

  return matches
    .map((match) => match[1]?.trim() ?? "")
    .filter((section) => section.length > 0);
}

export function parseStructuredMemoryEventMarkdown(
  markdown: string,
  index = 0
): StructuredMemoryRetrievalEvent {
  const title =
    readMarkdownLine(markdown, ["Type", "Event type", "Memory type"]) ||
    `memory-event-${index + 1}`;

  const latestUserIntent = readMarkdownLine(markdown, [
    "Latest user intent",
    "latest_user_intent",
    "User intent",
    "Latest user request"
  ]);

  const latestPolarisResult = readMarkdownLine(markdown, [
    "Latest Polaris result",
    "latest_polaris_result",
    "Polaris result",
    "Latest Polaris reply"
  ]);

  const digitalScentTrace = readMarkdownLine(markdown, [
    "Retrieval trace",
    "digital_scent_trace",
    "retrieval trace"
  ]);

  const retrievalPhrases = readCommaList(markdown, [
    "Retrieval phrases",
    "retrieval_phrases"
  ]);

  const scentTags = readCommaList(markdown, [
    "Scent tags",
    "Retrieval tags",
    "scent_tags"
  ]);

  const confidence = readMarkdownLine(markdown, ["Confidence", "confidence"]);

  return {
    id: `structured-memory-${index + 1}-${stableHash(markdown).slice(0, 8)}`,
    title,
    markdown,
    latestUserIntent,
    latestPolarisResult,
    digitalScentTrace,
    retrievalPhrases,
    scentTags,
    confidence,
    importanceScore: readImportanceScore(markdown)
  };
}

export function scoreStructuredMemoryEventForQuery(
  query: string,
  event: StructuredMemoryRetrievalEvent
): StructuredMemoryRetrievalResult {
  const queryTokens = tokenize(query);
  const searchText = normalizeText(eventSearchText(event));
  const matchedSignals: string[] = [];
  let score = 0;

  for (const token of queryTokens) {
    if (searchText.includes(token)) {
      score += 8;
      matchedSignals.push(`token:${token}`);
    }
  }

  for (const phrase of event.retrievalPhrases) {
    const normalizedPhrase = normalizeText(phrase);
    if (normalizedPhrase && normalizeText(query).includes(normalizedPhrase)) {
      score += 40;
      matchedSignals.push(`retrieval phrase:${phrase}`);
    }
  }

  for (const tag of event.scentTags) {
    const normalizedTag = normalizeText(tag);
    if (normalizedTag && normalizeText(query).includes(normalizedTag)) {
      score += 30;
      matchedSignals.push(`scent tag:${tag}`);
    }
  }

  if (isStructuredMemoryVagueReference(query) && event.importanceScore >= 65) {
    score += 15;
    matchedSignals.push("vague reference + high importance");
  }

  if (event.confidence === "confirmed") {
    score += 8;
    matchedSignals.push("confirmed memory");
  }

  if (event.confidence === "stale" || event.confidence === "conflicting") {
    score -= 12;
    matchedSignals.push(`weak confidence:${event.confidence}`);
  }

  return {
    event,
    score: Math.max(0, score),
    matchedSignals: uniqueList(matchedSignals)
  };
}

export function retrieveStructuredMemoryEventsByScent(input: {
  query: string;
  continuitySummary?: string | null;
  limit?: number;
}): StructuredMemoryRetrievalResponse {
  const query = input.query.trim();
  const limit = Math.max(1, Math.min(10, input.limit ?? 5));
  const sections = extractStructuredMemoryEventMarkdownSections(input.continuitySummary);
  const events = sections.map((section, index) => parseStructuredMemoryEventMarkdown(section, index));

  const results = events
    .map((event) => scoreStructuredMemoryEventForQuery(query, event))
    .filter((result) => result.score > 0)
    .sort((first, second) => second.score - first.score)
    .slice(0, limit);

  const isVagueReference = isStructuredMemoryVagueReference(query);

  return {
    query,
    isVagueReference,
    results,
    summary: buildStructuredMemoryRetrievalSummary(query, results, isVagueReference)
  };
}

export function buildStructuredMemoryRetrievalSummary(
  query: string,
  results: StructuredMemoryRetrievalResult[],
  isVagueReference = isStructuredMemoryVagueReference(query)
): string {
  if (results.length === 0) {
    return isVagueReference
      ? "No structured memory event matched that vague reference yet."
      : "No structured memory event matched that query yet.";
  }

  const top = results[0];

  return [
    `Matched ${results.length} structured memory event${results.length === 1 ? "" : "s"}.`,
    `Top match: ${top.event.title}.`,
    `Score: ${top.score}.`,
    `Signals: ${top.matchedSignals.length > 0 ? top.matchedSignals.join(", ") : "none"}.`
  ].join(" ");
}
