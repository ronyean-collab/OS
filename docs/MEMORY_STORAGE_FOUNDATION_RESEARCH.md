# Memory Storage Foundation Research (Phase 3)

## Goal
Prepare a future local-first scalable memory layer without introducing heavy infrastructure now.

## Lightweight Local Vector Storage Options
- SQLite extension-based vectors (best operational fit with current local DB architecture).
- File-backed ANN indexes as optional sidecar (only if background indexing remains cheap).
- Hybrid keyword + lightweight embeddings (default fallback when embeddings unavailable).

## Fragment Embedding Architecture (Prototype Direction)
- Keep canonical chat messages immutable and embedding-free.
- Embed only derived memory fragments and compressed summaries.
- Persist embedding metadata references to source fragment/message IDs.

## Continuity Graph Relationships
- Nodes: memory fragments, compressed bundles, user preferences, goals.
- Edges: derived_from, reinforces, contradicts, summarizes.
- Store graph links as compact JSON references for local traversal.

## Incremental Embedding Generation
- Trigger on newly created high-value fragments only.
- Skip low-importance fragments and defer during active chat bursts.
- Batch and backoff logic should keep UI thread unaffected.

## Background Indexing Strategy
- Run in non-blocking intervals after autosave.
- Abort/skip if provider stream active or CPU load is elevated.
- Always permit full continuity rebuild without index availability.

## Memory Scaling Strategy
- Multi-layer continuity:
  - active fragments
  - rolling summaries
  - compressed historical bundles
  - archival identity summaries
- Maintain source references for reversible reconstruction.
- Never require vector index availability for continuity recovery.
