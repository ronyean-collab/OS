# Embedded Local AI — First-Run Experience (Phase 17B)

## Goal

Install → Open → Name Assistant → Chat. Local AI preparation runs automatically in the background.

## Architecture

```
App launch
  → restore workspace / threads
  → resolveDefaultAiRoute()
  → prepareEmbeddedLocalAiOnFirstRun() [non-blocking]
       ├─ checkLocalAiReady()
       ├─ checkModelInstalled()
       ├─ downloadDefaultModel() via local runtime pull API
       └─ activateLocalAi() → saveProviderConfig + bootstrap
  → Renderer polls getEmbeddedAiConsumerStatus()
  → Auto-activates when phase === ready (no restart)
```

## Default model

Configured in `src/shared/default-ai-config.ts`:

- `DEFAULT_LOCAL_MODEL` = `llama3.2:3b`
- Override via env `DEFAULT_LOCAL_MODEL`

## Consumer status phases

| Phase | User sees |
|-------|-----------|
| checking | Almost ready |
| downloading | Preparing your AI… / Downloading AI |
| preparing | Almost ready |
| ready | ContinuityOS AI is ready |
| offline_waiting | AI setup will continue when you're online |
| paused | Preparation paused |

## No-trap rules

- Chat always reachable (`chatSendAllowed` true outside recovery)
- No provider wizard on first launch
- Settings → AI Providers for advanced control only
- Technical details (addresses, help links) behind Advanced disclosure

## Download recovery

- `pauseEmbeddedLocalAiDownload`
- `resumeEmbeddedLocalAiDownload`
- `restartEmbeddedLocalAiDownload`
- State persisted to `{userData}/embedded-ai-install-state.json`

## Key files

- `electron/main/services/embedded-local-ai-manager.ts`
- `src/shared/embedded-local-ai-consumer.ts`
- `src/shared/default-ai-config.ts`
- `electron/main/services/default-ai-runtime.ts`

## First-run flow (consumer)

1. User installs and opens ContinuityOS.
2. Two-step onboarding: Welcome → Name your assistant → Start chatting.
3. Chat opens immediately; no provider wizard, no forced setup dialog.
4. Main process calls `prepareEmbeddedLocalAiOnFirstRun()` without blocking UI restore.
5. If local AI runtime is found but default model (`llama3.2:3b`) is missing, background pull begins.
6. Banner shows consumer copy: "Preparing your AI…" with progress labels (Downloading AI / Preparing AI / Almost ready).
7. User can type messages; if AI not ready, composer saves locally and shows: "Your AI is getting ready. You can explore the app while it finishes."
8. When model is ready, `activateLocalAi()` enables ContinuityOS AI automatically — no restart.
9. Settings → AI Providers shows ContinuityOS AI card with Preparing | Ready | Unavailable status.
10. If offline during download, banner shows: "AI setup will continue when you're online." Notes, threads, and workspace remain usable.
