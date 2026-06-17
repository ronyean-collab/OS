import { v4 as uuid } from "uuid";
import type Database from "better-sqlite3";

const EMBEDDING_MODEL = "continuity-local-prototype-v1";
const EMBEDDING_DIMENSIONS = 32;

export type EmbeddingProvider = {
  id: string;
  embed: (content: string) => number[];
};

function hashTerm(term: string): number {
  let h = 0;
  for (let i = 0; i < term.length; i += 1) h = (h * 31 + term.charCodeAt(i)) >>> 0;
  return h;
}

function buildVector(content: string, dimensions = EMBEDDING_DIMENSIONS): number[] {
  const vec = new Array<number>(dimensions).fill(0);
  const terms = content.toLowerCase().split(/[^a-z0-9]+/).filter((v) => v.length >= 3);
  for (const term of terms) {
    const slot = hashTerm(term) % dimensions;
    vec[slot] += 1;
  }
  const norm = Math.sqrt(vec.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vec.map((value) => Number((value / norm).toFixed(6)));
}

const defaultProvider: EmbeddingProvider = {
  id: EMBEDDING_MODEL,
  embed: (content) => buildVector(content),
};

let activeProvider: EmbeddingProvider = defaultProvider;

export function setEmbeddingProvider(provider: EmbeddingProvider | null): void {
  activeProvider = provider ?? defaultProvider;
}

export function getEmbeddingProvider(): EmbeddingProvider {
  return activeProvider;
}

function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  for (let i = 0; i < len; i += 1) dot += a[i] * b[i];
  return Number(dot.toFixed(4));
}

export function updateEmbeddingCacheForThread(
  db: Database.Database,
  input: { workspaceId: string; threadId: string },
): { generated: number; skipped: boolean } {
  const enabled = process.env.CONTINUITY_DEBUG_EMBEDDINGS === "1";
  if (!enabled) return { generated: 0, skipped: true };

  const rows = db
    .prepare(
      `SELECT id, content
       FROM memory_fragments
       WHERE workspace_id = ? AND thread_id = ?
       ORDER BY created_at DESC
       LIMIT 120`,
    )
    .all(input.workspaceId, input.threadId) as Array<{ id: string; content: string }>;
  const upsert = db.prepare(
    `INSERT INTO embedding_cache (
      id, workspace_id, thread_id, fragment_id, embedding_key, embedding_vector_json, embedding_model, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(workspace_id, fragment_id, embedding_model) DO UPDATE SET
      embedding_vector_json = excluded.embedding_vector_json,
      updated_at = excluded.updated_at`,
  );

  const provider = getEmbeddingProvider();
  const now = new Date().toISOString();
  for (const row of rows) {
    const vector = provider.embed(row.content);
    upsert.run(
      uuid(),
      input.workspaceId,
      input.threadId,
      row.id,
      `${provider.id}:${row.id}`,
      JSON.stringify(vector),
      provider.id,
      now,
      now,
    );
  }
  return { generated: rows.length, skipped: false };
}

export function semanticRetrieveByEmbedding(
  db: Database.Database,
  input: { workspaceId: string; threadId: string; query: string; limit?: number },
): Array<{ fragmentId: string; score: number }> {
  const enabled = process.env.CONTINUITY_DEBUG_EMBEDDINGS === "1";
  if (!enabled) return [];
  const limit = input.limit ?? 8;
  const provider = getEmbeddingProvider();
  const queryVector = provider.embed(input.query);
  const rows = db
    .prepare(
      `SELECT fragment_id, embedding_vector_json
       FROM embedding_cache
       WHERE workspace_id = ? AND thread_id = ? AND embedding_model = ?
       ORDER BY updated_at DESC
       LIMIT 160`,
    )
    .all(input.workspaceId, input.threadId, provider.id) as Array<{
    fragment_id: string;
    embedding_vector_json: string;
  }>;
  return rows
    .map((row) => {
      try {
        const vector = JSON.parse(row.embedding_vector_json) as number[];
        return { fragmentId: row.fragment_id, score: cosineSimilarity(queryVector, vector) };
      } catch {
        return null;
      }
    })
    .filter((row): row is { fragmentId: string; score: number } => Boolean(row))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
