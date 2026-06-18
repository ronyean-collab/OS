# AI Startup Flow (Phase 17F)

## End-to-end path

```
App Launch
  ↓
Renderer bootstrap (App.tsx: bootstrap + loadWorkspace)
  ↓
Main: buildAppState() (handlers.ts)
  ↓
kickoffEmbeddedLocalAiPreparation() → prepareEmbeddedLocalAiOnFirstRun() [non-blocking]
  ↓
Assistant Preparation Screen (renderer gate via resolveUnifiedAssistantStatus)
  ↓
Runtime Detection (getLocalAiStatus → discoverOllamaEndpoint → GET /api/tags)
  ↓
Runtime Installation (provisionLocalRuntime → local-runtime-provisioner.ts)
  ↓
Runtime Startup (spawn ollama serve with OLLAMA_HOST on managed port 11435)
  ↓
Model Detection (checkLocalAiReady / modelMatchesAvailable)
  ↓
Model Download (downloadDefaultModel → POST /api/pull NDJSON stream)
  ↓
Model Verification (testProviderConnection → GET /api/tags + model match)
  ↓
Assistant Ready (activateLocalAi → phase ready, defaultAiCanReply true)
```

## Services involved

| Service | Role |
|---------|------|
| `electron/main/ipc/handlers.ts` | App state, IPC, kickoff preparation |
| `electron/main/services/embedded-local-ai-manager.ts` | Install orchestration, model pull, activation |
| `electron/main/services/local-runtime-provisioner.ts` | Runtime detect / install / start |
| `electron/main/services/local-ai-service.ts` | Ollama endpoint discovery |
| `electron/main/services/local-ai-bootstrap.ts` | Default provider row sync |
| `electron/main/services/default-ai-runtime.ts` | Default AI route + canReply truth |
| `electron/main/services/provider-connection-test.ts` | Connection + model verification |
| `src/shared/assistant-preparation-service.ts` | Preparation screen mapping |
| `src/shared/provisioning-readiness.ts` | Single readiness state for UI |
| `src/shared/ai-readiness.ts` | Consumer readiness messages |

## State transitions (embedded install phase)

| Phase | Meaning |
|-------|---------|
| `idle` | No preparation started |
| `checking` | Probing runtime / workspace setup |
| `installing_runtime` | Downloading/installing Ollama |
| `starting_runtime` | Spawning `ollama serve` |
| `downloading` | Pulling default model via `/api/pull` |
| `preparing` | Activating provider + verifying |
| `ready` | Runtime + model verified |
| `offline_waiting` | Network loss — resumes on retry |
| `paused` | User paused download |
| `failed` | Unrecoverable without user action |

## Unified provisioning readiness (UI)

| State | When |
|-------|------|
| `PREPARING` | checking, installing_runtime |
| `STARTING` | starting_runtime |
| `DOWNLOADING` | downloading |
| `VERIFYING` | preparing, ready-but-not-canReply |
| `READY` | canReply true |
| `FAILED` | failed, offline_waiting, paused, needs_attention |

## Failure states

| Condition | Phase | User sees |
|-----------|-------|-----------|
| Runtime not detected, install disabled | `failed` | Preparation failed |
| Network loss during install/download | `offline_waiting` | Offline message |
| Model pull HTTP error | `failed` | Needs attention |
| Connection test fails after download | `failed` | Needs attention |
| Runtime start timeout | `failed` | Needs attention |

## Blocking conditions

| Gate | Rule |
|------|------|
| Preparation screen | `shouldShowAssistantPreparationScreen` until ready or user bypass |
| `canReply` / `defaultAiCanReply` | Only true after `testProviderConnection` succeeds |
| Stream routing | `resolveDefaultChatProvider` requires `route.canReply && status === ready` |
| Embedded `aiRepliesReady` | Only when install phase === `ready` |

## Persistence

- `{userData}/embedded-ai-install-state.json` — model install progress
- `{userData}/managed-runtime/runtime-provision-state.json` — runtime provision diagnostics

## Polling

Renderer polls `getEmbeddedAiConsumerStatus()` + `getAppState()` every ~2s while preparation is active.
