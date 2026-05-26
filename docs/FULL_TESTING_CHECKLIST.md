# ContinuityOS Desktop — Full Testing Checklist

Use this checklist for product-readiness and release verification.  
**Principles:** local-first, deterministic storage, no telemetry, recovery-first, no raw API keys in SQLite/logs.

---

## A. Startup

| # | Check | Pass | Notes |
|---|--------|------|-------|
| A1 | Fresh install opens (no prior DB) | ☐ | |
| A2 | Existing database opens | ☐ | |
| A3 | Previous crash detected safely (recovery banner) | ☐ | |
| A4 | Migration dry-run works (no mutation) | ☐ | Ops → migration dry-run |
| A5 | Migrations apply cleanly on upgrade | ☐ | |
| A6 | Schema version matches `SCHEMA_VERSION` | ☐ | Diagnostics panel |
| A7 | Recovery mode blocks destructive import/export | ☐ | |

---

## B. Provider setup

| # | Check | Pass | Notes |
|---|--------|------|-------|
| B1 | First-run onboarding shows welcome + provider choices | ☐ | |
| B2 | OpenAI setup saves key to secure storage only | ☐ | |
| B3 | Invalid API key shows calm error (no crash) | ☐ | |
| B4 | No-provider mode: chat explains provider required | ☐ | |
| B5 | Setup-only providers do not crash chat | ☐ | |
| B6 | API keys never in SQLite `provider_configs` plaintext | ☐ | Inspect DB |
| B7 | API keys never in diagnostics export | ☐ | Search bundle for `sk-` |
| B8 | API keys never in crash log / audit | ☐ | |
| B9 | Provider badge in header reflects ready vs setup-only | ☐ | |

---

## C. Chat runtime

| # | Check | Pass | Notes |
|---|--------|------|-------|
| C1 | Create thread | ☐ | Ctrl+N |
| C2 | Send user message | ☐ | |
| C3 | Assistant response streams | ☐ | |
| C4 | Cancel stream | ☐ | |
| C5 | Stream failure shows calm error | ☐ | |
| C6 | Restart app and continue same thread | ☐ | |
| C7 | Large thread: only recent page in UI initially | ☐ | “Load earlier messages” |
| C8 | Context assembly uses recent tail only (~40 msgs) | ☐ | Automated: `context-assembly.test.ts` |
| C9 | Active thread persisted across restart | ☐ | |
| C10 | Wrong thread not used after switch | ☐ | |

---

## D. Thread management

| # | Check | Pass | Notes |
|---|--------|------|-------|
| D1 | Create thread | ☐ | |
| D2 | Rename thread | ☐ | |
| D3 | Reorder (move up/down) | ☐ | |
| D4 | Archive / unarchive | ☐ | |
| D5 | Soft delete / restore | ☐ | |
| D6 | Active thread repair after delete | ☐ | |
| D7 | Messages preserved after archive/delete | ☐ | |
| D8 | Show archived / deleted filters | ☐ | |

---

## E. Continuity / long-running project

| # | Check | Pass | Notes |
|---|--------|------|-------|
| E1 | Create workspace | ☐ | |
| E2 | Chat over many turns (same workspace) | ☐ | |
| E3 | Create manual snapshot | ☐ | |
| E4 | Plain export backup | ☐ | |
| E5 | Import backup (new workspace) | ☐ | |
| E6 | Restore snapshot preview + execute | ☐ | |
| E7 | Timeline events recorded for key actions | ☐ | |
| E8 | Replay hash stable for unchanged history | ☐ | |
| E9 | Workspace health scan useful | ☐ | |
| E10 | Project continuity summary (user-editable) | ☐ | |

---

## F. Backup and restore

| # | Check | Pass | Notes |
|---|--------|------|-------|
| F1 | Plain export JSON/bundle | ☐ | |
| F2 | Encrypted export with password | ☐ | |
| F3 | Wrong password fails calmly | ☐ | |
| F4 | Encrypted import preview | ☐ | |
| F5 | Encrypted import success | ☐ | |
| F6 | Corrupt/tampered bundle rejected (`ok: false`) | ☐ | Automated: `v12-restore-lane` |
| F7 | No partial import on failure | ☐ | |
| F8 | FK remapping on import | ☐ | |
| F9 | Original IDs only in import metadata | ☐ | |
| F10 | Manifest/replay validation on encrypted path | ☐ | |

---

## G. Performance / RAM

| # | Check | Pass | Notes |
|---|--------|------|-------|
| G1 | App launches under expected RAM baseline | ☐ | Task Manager |
| G2 | Thread switching stays responsive | ☐ | |
| G3 | Large thread does not load full history in renderer | ☐ | Page size 40 |
| G4 | Stream path loads bounded context from SQLite | ☐ | ~40 msgs |
| G5 | Export/import does not permanently spike RAM | ☐ | Close modal, observe |
| G6 | No runaway intervals/listeners | ☐ | DevTools / long session |
| G7 | Ops panels (timeline/snapshots) load on demand | ☐ | |

---

## H. Build / package

| # | Check | Pass | Notes |
|---|--------|------|-------|
| H1 | `npm test` — 37 files / 198 tests | ☐ | |
| H2 | `npm run build` | ☐ | |
| H3 | `npm run dev` launches | ☐ | |
| H4 | Preload bridge exposes `window.continuity` | ☐ | |
| H5 | Renderer shows fallback if preload missing | ☐ | |
| H6 | Production output: `out/main`, `out/preload`, `out/renderer` | ☐ | |

---

## I. Native SQLite / dual runtime (Node vs Electron)

| # | Check | Pass | Notes |
|---|--------|------|-------|
| I1 | `npm rebuild better-sqlite3` succeeds (Node/Vitest) | ☐ | Or `npm run rebuild:native:node` |
| I2 | `npx electron-rebuild -f -w better-sqlite3` succeeds | ☐ | Or `npm run rebuild:native:electron` |
| I3 | `npx electron scripts/verify-sqlite-electron.mjs` prints OK | ☐ | After Electron rebuild |
| I4 | `npm test` passes (no NODE_MODULE mismatch) | ☐ | |
| I5 | `npm run dev` does not show Recovery from sqlite failure | ☐ | Manual UI |
| I6 | Schema not stuck at 0 after normal startup | ☐ | Manual UI |
| I7 | Use `npm run dev` not raw `electron-vite dev` | ☐ | Ensures Electron rebuild |

**Rule:** `npm test` switches binary to Node ABI; `npm run dev` rebuilds for Electron first.

---

## J. Git / release hygiene

| # | Check | Pass | Notes |
|---|--------|------|-------|
| J1 | `git status` clean or only intentional changes | ☐ | |
| J2 | On `main`, tracking `origin/main` | ☐ | |
| J3 | No temp logs staged (`build-check-log.txt`, etc.) | ☐ | See `.gitignore` |
| J4 | `npm run build` before tagging release | ☐ | |

---

## K. Manual RAM / long-session

| # | Check | Pass | Notes |
|---|--------|------|-------|
| K1 | Baseline RAM at idle (Task Manager) | ☐ | Record MB |
| K2 | Large thread (500+ msgs): UI stays paginated | ☐ | Load earlier only |
| K3 | RAM stable after closing import/export modal | ☐ | |
| K4 | Multi-hour session: no runaway growth | ☐ | |
| K5 | Multi-day continuity: export → re-import → continue | ☐ | |

---

## L. Secret leakage checks

| # | Check | Pass | Notes |
|---|--------|------|-------|
| L1 | SQLite `provider_configs` has `secure_key_ref` only | ☐ | |
| L2 | Diagnostics copy/export redacts secrets | ☐ | Automated: `crash-recovery` |
| L3 | No `sk-` in renderer console during setup | ☐ | DevTools |
| L4 | Encrypted backup password not stored | ☐ | |

---

## M. OpenAI live connection (manual)

| # | Check | Pass | Notes |
|---|--------|------|-------|
| M1 | Test connection with valid key | ☐ | |
| M2 | Test connection with invalid key (calm error) | ☐ | |
| M3 | Stream one real assistant reply | ☐ | |

---

## N. Recovery mode scenarios (manual)

| # | Check | Pass | Notes |
|---|--------|------|-------|
| N1 | Normal startup: no Recovery banner | ☐ | |
| N2 | Recovery after real DB corruption (if tested) | ☐ | Do not delete DB casually |
| N3 | Recovery mode blocks import/export | ☐ | |
| N4 | Migration dry-run from Ops does not mutate | ☐ | Automated: `v12-restore-lane` |

---

## O. Project continuity summary (manual)

| # | Check | Pass | Notes |
|---|--------|------|-------|
| O1 | Project tools shows Continuity summary panel | ☐ | Hidden from main chat by default |
| O2 | Create/edit/save summary persists after restart | ☐ | |
| O3 | Empty summary does not break chat | ☐ | |
| O4 | Summary visible in overview; chat history unchanged | ☐ | Messages not deleted |
| O5 | Export/import preserves continuity summary | ☐ | Automated: `continuity-summary.test.ts` |
| O6 | Snapshot restore preserves summary when checkpoint includes it | ☐ | Automated: `continuity-summary.test.ts` |
| O7 | Large summary (several KB) does not freeze UI | ☐ | Max 8000 chars stored |
| O8 | Timeline shows continuity_summary_updated on save | ☐ | |

---

## P. Universal Context Pack / manual AI mode

| # | Check | Pass | Notes |
|---|--------|------|-------|
| P1 | Generate Universal Context Pack with no provider configured | ☐ | |
| P2 | User can preview exactly what will be copied before copying | ☐ | |
| P3 | Copy Context Pack works for ChatGPT / Claude / Gemini / Any AI | ☐ | |
| P4 | Paste AI response back and save exchange into current thread | ☐ | |
| P5 | Restart app and confirm saved manual exchange persists | ☐ | |
| P6 | New Context Pack includes the pasted assistant response in recent context | ☐ | |
| P7 | Manual exchange works without any API key | ☐ | |
| P8 | Export/import preserves manual exchange messages | ☐ | Automated: `manual-context-pack.test.ts` |
| P9 | Timeline shows context pack creation + manual response save | ☐ | |
| P10 | No provider mode still shows calm guidance and does not crash | ☐ | |

---

## Q. Normal chat composer / manual fallback flow

| # | Check | Pass | Notes |
|---|--------|------|-------|
| Q1 | Fresh app opens to threads + current chat without provider onboarding | ☐ | |
| Q2 | Provider setup does not block startup or sending the first message | ☐ | |
| Q3 | Bottom composer looks like a normal chat box with placeholder `Message your workspace…` | ☐ | |
| Q4 | Pressing Enter sends; Shift+Enter inserts a newline | ☐ | |
| Q5 | No-provider send saves the user message locally immediately and keeps the thread centered | ☐ | |
| Q6 | No-provider send shows a chat-like ContinuityOS guidance card instead of an error banner | ☐ | |
| Q7 | Guidance card clearly explains that the message was saved locally and the AI reply path is the Context Pack | ☐ | |
| Q8 | Copy Context Pack works from the fallback guidance flow without any API key | ☐ | |
| Q9 | Pasting an external AI response saves only the assistant response without duplicating the saved user message | ☐ | |
| Q10 | Provider failure falls back calmly to `Continue in Any AI` without losing the user message | ☐ | |
| Q11 | Provider settings remain accessible but only inside Project tools | ☐ | |
| Q12 | Export/import/diagnostics/snapshots are hidden from the main screen but still accessible | ☐ | |
| Q13 | Thread list remains visible by default with rename/move/archive/delete reachable from the thread menu | ☐ | |
| Q14 | No-provider state feels calm and non-blocking | ☐ | |

---

## R. Markdown Memory Files

| # | Check | Pass | Notes |
|---|--------|------|-------|
| R1 | Project tools shows `Markdown Memory Files` section | ☐ | |
| R2 | Copy import prompt works and says any AI, not only ChatGPT | ☐ | Automated: `continuity-import-file.test.ts` |
| R3 | Pasting a valid markdown memory file shows preview before import | ☐ | Automated: `continuity-import-file.test.ts` |
| R4 | Preview includes file type, source, project name/type, objective, summary, counts, and generated date | ☐ | |
| R5 | Update current workspace applies imported state without deleting messages | ☐ | Automated: `continuity-import-file.test.ts` |
| R6 | Create new workspace import works | ☐ | Automated: `continuity-import-file.test.ts` |
| R7 | Checkpoint-only import stores the file without overwriting continuity summary | ☐ | |
| R8 | Raw markdown source is preserved safely for audit/review | ☐ | Automated: `continuity-import-file.test.ts` |
| R9 | Export Project State (`.md`) works without a provider | ☐ | Automated: `continuity-import-file.test.ts` |
| R10 | Export AI Handoff (`.md`) works without a provider | ☐ | Automated: `continuity-import-file.test.ts` |
| R11 | Export Thread Summary (`.md`) works when a thread is active | ☐ | |
| R12 | Memory / Project State review area shows recent records and key saved fields | ☐ | |
| R13 | Timeline shows `continuity_import_file_applied` after confirm | ☐ | Automated: `continuity-import-file.test.ts` |
| R14 | New Context Pack includes `Markdown Memory / Project State` plus decisions/issues/next steps | ☐ | Automated: `continuity-import-file.test.ts` |

---

## S. Local AI / Ollama

| # | Check | Pass | Notes |
|---|--------|------|-------|
| S1 | Project tools AI panel shows Local AI section | ☐ | |
| S2 | Detect Ollama shows calm not-running state when unavailable | ☐ | Automated: `local-ai.test.ts` |
| S3 | Refresh models lists available Ollama models when reachable | ☐ | |
| S4 | Local AI setup requires no API key | ☐ | Automated: `provider-multi.test.ts` |
| S5 | Use Local AI saves Ollama as the active provider | ☐ | |
| S6 | Test Local AI uses Ollama connection test copy | ☐ | |
| S7 | Local AI chat saves assistant response when Ollama is reachable | ☐ | Automated: `local-ai.test.ts` |
| S8 | Imported state and continuity summary are included before local AI call | ☐ | Automated: `local-ai.test.ts` |
| S9 | If Ollama is unavailable, Manual Mode fallback still works calmly | ☐ | Requires live UI validation |
| S10 | Local AI remains optional and does not block startup or normal manual chat | ☐ | |

---

## T. Guided continuity routine

| # | Check | Pass | Notes |
|---|--------|------|-------|
| T1 | Chat shows `ContinuityOS Guide` on workspace open | ☐ | |
| T2 | Welcome guide offers Continue in Any AI / Import Memory / Review Project Memory / Back Up / Export / Set Up Local AI | ☐ | |
| T3 | Typing `import memory` starts an in-chat import workflow instead of only moving focus to Project tools | ☐ | |
| T4 | In-chat import flow previews pasted markdown before apply | ☐ | |
| T5 | In-chat import flow supports Update current workspace / Checkpoint only / Create new workspace | ☐ | |
| T6 | After markdown memory import, guide says to copy a Context Pack next and the in-chat Context Pack flow is visible | ☐ | |
| T7 | Typing `continue in any ai` or `context pack` starts an in-chat Context Pack workflow | ☐ | |
| T8 | Copy Context Pack action transitions to an in-chat paste-response workflow | ☐ | |
| T9 | Typing `paste response` or `save response` opens the in-chat pasted-response workflow | ☐ | |
| T10 | Saving a pasted AI response shows response-saved guidance with memory-update / continue / backup actions | ☐ | |
| T11 | Typing `what do you know` or `review memory` shows an in-chat memory review card without inventing missing facts | ☐ | |
| T12 | Typing `backup` or `export` shows in-chat backup/export guidance with markdown export actions | ☐ | |
| T13 | Typing `local ai` or `ollama` shows in-chat Local AI guidance and detection controls | ☐ | |
| T14 | Normal chat composer still works and guide does not fake assistant output | ☐ | |
| T15 | Project tools stays optional for basic chat-driven workflows | ☐ | |

### T Manual Flow

- Type `import memory` into chat and confirm the in-chat import routine appears.
- Paste markdown memory, preview it in chat, and apply it in chat.
- Confirm the next step says to copy a Context Pack.
- Copy the Context Pack in chat and confirm the paste-response workflow appears.
- Paste an AI response in chat, save it, and confirm the assistant response is appended once.
- Type `backup` and confirm in-chat backup guidance appears.
- Type `what do you know` and confirm the in-chat memory review card appears.
- Type `local ai` and confirm the in-chat Local AI guidance appears.
- Confirm Project tools remain optional for these flows.
- Confirm no provider gate appears.

---

## Automated test commands

```bash
npm test
npm run build
npx vitest run tests/chat-workflows.test.ts
npx vitest run tests/guided-routines.test.ts
npx vitest run tests/context-assembly.test.ts
npx vitest run tests/continuity-summary.test.ts
npx vitest run tests/manual-context-pack.test.ts
npx vitest run tests/onboarding-flow.test.ts
npx vitest run tests/provider-setup.test.ts
npx vitest run tests/provider-multi.test.ts
npx vitest run tests/manual-context-pack.test.ts tests/stream-runtime.test.ts tests/thread-sidebar-runtime.test.ts tests/onboarding-flow.test.ts
npx vitest run tests/manual-context-pack.test.ts tests/stream-runtime.test.ts tests/onboarding-flow.test.ts tests/manual-fallback-copy.test.ts
npx vitest run tests/guided-routines.test.ts tests/continuity-import-file.test.ts tests/manual-context-pack.test.ts tests/manual-fallback-copy.test.ts tests/stream-runtime.test.ts tests/onboarding-flow.test.ts
npx vitest run tests/chat-workflows.test.ts tests/guided-routines.test.ts tests/continuity-import-file.test.ts tests/manual-context-pack.test.ts tests/manual-fallback-copy.test.ts tests/stream-runtime.test.ts tests/onboarding-flow.test.ts
npx vitest run tests/continuity-import-file.test.ts tests/local-ai.test.ts tests/manual-context-pack.test.ts tests/continuity-summary.test.ts tests/stream-runtime.test.ts
npx vitest run tests/continuity-import-file.test.ts tests/context-assembly.test.ts tests/manual-context-pack.test.ts tests/stream-runtime.test.ts
npx vitest run tests/workspace-import.test.ts
npx vitest run tests/v12-restore-lane.test.ts
npx vitest run tests/stream-runtime.test.ts
npx vitest run tests/thread-management.test.ts
npx vitest run tests/thread-sidebar-runtime.test.ts
```

---

## Sign-off

| Role | Name | Date | Result |
|------|------|------|--------|
| Dev | | | |
| QA / Manual | | | |
