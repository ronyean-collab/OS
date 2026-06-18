# ContinuityOS Architecture Overview

High-level map of ContinuityOS Desktop. This document describes **how the system is shaped**, not every module.

## Design goals

1. **Local-first persistence** — SQLite is the source of truth on device.
2. **Continuity over chat** — canonical messages, snapshots, timeline, recovery.
3. **Thin renderer** — no Node in renderer; IPC via preload.
4. **Observable locally** — diagnostics and health snapshots without cloud telemetry.
5. **Explicit product boundaries** — no sync/agents/billing in core architecture.

## Layered architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        Renderer (React)                          │
│  App shell · ChatPanel · OnboardingWizard · Project tools        │
│  Lazy: DiagnosticsPanel · ContinuityInspectorModal               │
└────────────────────────────┬─────────────────────────────────────┘
                             │ window.continuity (preload)
┌────────────────────────────▼─────────────────────────────────────┐
│                     IPC handlers + validation                      │
└────────────────────────────┬─────────────────────────────────────┘
                             │
┌────────────────────────────▼─────────────────────────────────────┐
│                         Service layer                              │
├────────────────────────────────────────────────────────────────────┤
│ Workspace / thread / message    │ Context assembly                 │
│ Stream runtime                  │ Snapshot + savepoint integrity   │
│ Provider (Ollama)               │ Backup export/import             │
│ Compatibility + migrations      │ Diagnostics + system health      │
│ Memory state (internal)         │ Continuity inspector (dev-facing)│
│ Reliability metrics             │ Daily-driver telemetry (counts)  │
└────────────────────────────┬─────────────────────────────────────┘
                             │
┌────────────────────────────▼─────────────────────────────────────┐
│  SQLite (better-sqlite3)     │  secure-storage (API keys)        │
│  migrations · app_meta       │  userData/secure-secrets/           │
└──────────────────────────────────────────────────────────────────┘
```

## Core data flows

### Send message (Ollama)

1. Renderer calls IPC `sendMessage` / stream channel.
2. Main persists user message; assembles context from thread history + memory rules.
3. Stream runtime talks to Ollama adapter; tokens streamed to renderer.
4. On complete or cancel, assistant message finalized; reliability metrics updated.
5. Optional snapshot hooks for continuity checkpoints.

### Manual Mode

1. Context pack built from same assembly pipeline (no cloud send from app for chat).
2. User copies pack externally; pastes reply.
3. Reply ingested as assistant message — continuity preserved locally.

### Backup / restore

1. Export serializes workspace scope to encrypted JSON.
2. Import parses preview → user confirms → transactional apply or rollback.
3. Migration version checked on startup after restore.

## Continuity concepts

| Concept | Role |
|---------|------|
| **Canonical message** | Normalized role/content + provider raw JSON |
| **Timeline events** | Audit trail of workspace actions |
| **Snapshots** | Point-in-time continuity checkpoints |
| **Savepoint integrity** | Validation that continuity state is consistent |
| **Recovery mode** | Degraded startup when DB cannot open normally |

## Observability (local only)

**Diagnostics report** (UI): version, schema, recovery flags, update readiness, **system health** (5 dimensions).

**Diagnostics bundle** (export JSON): audit counts, crash summary, migration audit, integrity scan summary, workspace counts — **no message bodies, no secrets**.

**Daily-driver metrics** (`daily-driver-metrics.json`): aggregate counters in userData — no content.

## Security boundaries

- Renderer: no `nodeIntegration`, context isolation on.
- Secrets: `safeStorage` only; SQLite holds `secure_key_ref`.
- Diagnostics: pattern scan rejects likely API key material in exports.

## Testing architecture

| Layer | Tool |
|-------|------|
| Services / DB | Vitest + in-memory/temp SQLite |
| Continuity simulation | `tests/utils/continuity-sim.ts` |
| E2E | Playwright + `CONTINUITY_E2E_USER_DATA` |
| Soak | `scripts/soak/endurance-runner.mjs` |

## What is intentionally outside v1 architecture

- Cloud sync service
- Multi-tenant auth backend (Supabase foundation may exist as placeholder only)
- Agent orchestration / tool execution loops
- Marketplace or plugin loader
- Cloud analytics pipeline

## Related docs

- [PRODUCT-VISION.md](./PRODUCT-VISION.md)
- [SECURITY-CHECKLIST.md](./SECURITY-CHECKLIST.md)
- [README.md](./README.md)
