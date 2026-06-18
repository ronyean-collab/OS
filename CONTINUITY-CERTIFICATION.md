# Continuity Certification

**Phase:** 8 — Release Candidate Validation  
**Date:** 2026-05-29

## Certification Tests

| # | Promise | Evidence | Score |
|---|---------|----------|-------|
| 1 | Restart recovery | `recovery-runtime.test.ts`, E2E `restart.spec.ts` | **A** |
| 2 | Crash recovery | `crash-recovery.test.ts`, `recoverInterruptedStreams` | **A** |
| 3 | Autosave recovery | `autosave-runtime.test.ts` | **A** |
| 4 | Savepoint recovery | `restore-service.test.ts`, `v12-restore-lane.test.ts` | **A** |
| 5 | Derived-memory rebuild | `memory-state.test.ts`, `continuity-runtime.test.ts` | **B** |
| 6 | Compression rebuild | `continuity-runtime` interrupted compression case | **A** |
| 7 | Provider reconnect | `provider-setup.test.ts`, `local-ai.test.ts` | **B** |
| 8 | Provider switching | `provider-multi.test.ts` (Ollama chat lane) | **B** |
| 9 | Backup restore | `restore-service.test.ts`, snapshots | **A** |
| 10 | Import/export roundtrip | `rc-certification.test.ts`, `workspace-import.test.ts` | **A** |

## Canonical Truth

| Rule | Verified |
|------|----------|
| SQLite `messages` remain source of truth | Yes — stream tests assert no duplicate rows |
| Interrupted streams marked `interrupted`, content preserved | Yes — RC certification test |
| Import remaps IDs without losing message bodies | Yes — workspace-import tests |
| Export excludes API keys | Yes — `crash-recovery` diagnostics + secure-storage tests |

## Aggregate Scores

| Dimension | Grade | Notes |
|-----------|-------|-------|
| Continuity preservation | **A** | 10k/50k simulations pass |
| Recovery success | **A** | Recovery mode + stream finalization |
| Reconstruction fidelity | **A** | `thread-reconstruction.test.ts` |
| Provider portability | **B** | Manual Mode for cloud; Ollama in-app |

## Overall Continuity Certification

**CERTIFIED** for release-candidate scope with documented Manual Mode / Ollama split.
