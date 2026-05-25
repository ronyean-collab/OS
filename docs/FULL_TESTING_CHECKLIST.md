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
| H1 | `npm test` — 32 files / 169 tests | ☐ | |
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
| Q6 | Compact `Continue in Any AI` card appears after local-only send without overwhelming the chat UI | ☐ | |
| Q7 | Copy Context Pack works without preview-first friction and without any API key | ☐ | |
| Q8 | Pasting an external AI response saves only the assistant response without duplicating the saved user message | ☐ | |
| Q9 | Provider failure falls back calmly to `Continue in Any AI` without losing the user message | ☐ | |
| Q10 | Provider settings remain accessible but only inside Project tools | ☐ | |
| Q11 | Export/import/diagnostics/snapshots are hidden from the main screen but still accessible | ☐ | |
| Q12 | Thread list remains visible by default with rename/move/archive/delete reachable from the thread menu | ☐ | |
| Q13 | No-provider state feels calm and non-blocking | ☐ | |

---

## Automated test commands

```bash
npm test
npm run build
npx vitest run tests/context-assembly.test.ts
npx vitest run tests/continuity-summary.test.ts
npx vitest run tests/manual-context-pack.test.ts
npx vitest run tests/onboarding-flow.test.ts
npx vitest run tests/provider-setup.test.ts
npx vitest run tests/provider-multi.test.ts
npx vitest run tests/manual-context-pack.test.ts tests/stream-runtime.test.ts tests/thread-sidebar-runtime.test.ts tests/onboarding-flow.test.ts
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
