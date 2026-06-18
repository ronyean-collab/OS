# ContinuityOS Manual QA Checklist

**Phase 8 — Release Candidate Validation** (expanded)

## Onboarding
- [ ] Fresh workspace shows 5-step onboarding wizard
- [ ] Ollama path: choose → setup → test → ready → enter workspace
- [ ] Manual Mode path: choose "Manual Mode only" → skip connection test → enter workspace
- [ ] OpenAI / OpenRouter / Claude / Gemini choices explain Manual Mode (no in-app cloud chat)
- [ ] Quit and relaunch mid-wizard resumes at saved step (localStorage v2)
- [ ] Onboarding does not reappear after completion + restart

## Provider setup
- [ ] Workspace → Providers shows active status and catalog
- [ ] Test Ollama connection succeeds when Ollama is running
- [ ] Test connection fails calmly when Ollama is stopped
- [ ] Model selection persists after restart
- [ ] Reconnect after stopping Ollama shows calm composer hint
- [ ] Cloud API keys save to secure storage (never visible in SQLite export)

## Provider switching
- [ ] Switch preferred cloud provider in onboarding → Manual Mode context pack still works
- [ ] Ollama remains in-app chat engine after cloud preference saved
- [ ] Provider readiness banner matches actual Ollama state

## Chat
- [ ] Ollama chat streams when ready
- [ ] Manual Mode: send message without Ollama → context pack panel appears
- [ ] Paste manual assistant response saves to thread
- [ ] Cancel stream preserves partial assistant content
- [ ] Active thread messages persist after restart

## Thread lifecycle
- [ ] Create thread
- [ ] Rename thread
- [ ] Reorder thread (move up / down)
- [ ] Archive thread
- [ ] Restore archived thread
- [ ] Soft delete thread
- [ ] Restore deleted thread
- [ ] Delete confirmation shown

## Recovery
- [ ] Simulated / real crash shows recovery banner with calm copy
- [ ] Recovery details modal opens from banner or settings
- [ ] Continue workspace exits recovery when healthy
- [ ] Recovery mode still allows export backup
- [ ] Interrupted streaming messages finalized as interrupted

## Export
- [ ] Export backup from Workspace → Backups
- [ ] Progress / success transfer banner
- [ ] Exported JSON does not contain API keys
- [ ] Encrypted export with password
- [ ] Large workspace export completes within acceptable time

## Import
- [ ] Import preview shows summary before apply
- [ ] Import restores threads and messages
- [ ] Wrong encrypted password fails without partial import
- [ ] Corrupt bundle rejected with clear error
- [ ] Continue chat in imported workspace

## Workspace lifecycle
- [ ] Create default workspace on first launch
- [ ] Workspace health in Settings reflects DB state
- [ ] Delete workspace (if supported) or reset via import replacement
- [ ] Diagnostics export redacts secrets

## Restart lifecycle
- [ ] Save conversation → quit app → relaunch → same workspace and thread
- [ ] Onboarding skipped when already completed
- [ ] Autosave timestamp updates during chat
- [ ] Runtime health score visible in Providers panel when available

## Settings & ops
- [ ] Workspace → Settings shows health and activity
- [ ] Diagnostics panel opens and export is safe
- [ ] Continuity inspector (if enabled) reports without blocking chat
- [ ] Close workspace tools returns to manual-first chat layout

## Soak / endurance (release hardware)
- [ ] 12h soak: `SOAK_MODE=12h npm run test:soak:endurance`
- [ ] Review `soak-runs/12h/soak-report.json` for heap growth
- [ ] No failed cycles over full duration
