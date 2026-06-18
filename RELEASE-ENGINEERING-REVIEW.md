# Release Engineering Review

**Phase:** 11 — Production Readiness + Growth Foundation  
**Date:** 2026-05-28  
**Version:** 0.1.0 (schema v13)

## Executive summary

ContinuityOS Desktop has a **repeatable build**, **versioned schema migrations**, **backup/recovery paths**, and **automated test gates**. Release engineering is **beta-ready** with documented manual steps for long soak and installer polish.

**Verdict:** ✅ **Release engineering adequate for closed beta** — run full wall-clock soak and icon assets before public stable.

---

## Build process

| Step | Command | Status |
|------|---------|--------|
| Install deps | `npm install` | Standard |
| Unit/integration tests | `npm test` | Vitest, 300+ tests |
| Compile | `npm run build` | electron-vite (main + preload + renderer) |
| Package | `npm run dist` | electron-builder → `release/` |
| E2E | `npm run test:e2e` | Playwright, isolated `userData` |
| Release bundle | `npm run test:release` | Aggregates release-critical tests |

**Artifacts:** `out/` (compiled), `release/` (installers per `electron-builder.yml`).

**Notes:**

- `manualChunks` splits vendor, continuity-inspector, and diagnostics for load performance.
- Lazy-loaded modals: Continuity Inspector, Diagnostics Panel.

---

## Packaging

Configuration: `electron-builder.yml`

- **Windows:** NSIS
- **macOS:** DMG
- **Linux:** AppImage
- **Icon:** `build/icon.svg` (may need `.ico` / `.icns` for production polish)
- **publish:** `null` (no auto-publish channel wired)

---

## Startup

1. Electron main initializes database connection.
2. `evaluateStartupCompatibility` — downgrade detection, migration warnings.
3. Recovery mode flag if DB open fails (limited UI).
4. Renderer loads; onboarding if workspace not completed.

**Health signal:** Diagnostics → **Startup health** + **Migration health**.

---

## Migrations

- Schema version in `electron/main/database/schema.ts` (currently **13**).
- `migrations.ts` applies incremental SQL; audit logged to migration audit JSONL in test mode.
- `getAppliedVersion` vs `SCHEMA_VERSION` surfaced in diagnostics.
- **Upgrade path:** install new build over old → migrations run on first open.
- **Downgrade:** detected; user warned — not supported for production use.

**Verified in tests:** `release-runtime.test.ts`, migration audit, compatibility registry.

---

## Backups

- Encrypted workspace export (user passphrase).
- Import preview with counts and warnings.
- Rollback on failed import.
- Export metadata recorded in `app_meta` (`last_export_at`, version).

**E2E:** backup export/import via test bridge (file dialog limitations documented).

---

## Recovery

- Stream interruption recovery (reliability metrics).
- Recovery mode database path.
- Orphan message repair in Diagnostics.
- Post-upgrade recovery stress tests (`recovery-stress.test.ts`).

**Health signal:** Diagnostics → **Recovery health**.

---

## Verification matrix

| Scenario | Method | Result |
|----------|--------|--------|
| Clean install | E2E onboarding + fresh userData | ✅ Pass |
| Upgrade install | Migration tests + schema registry | ✅ Pass |
| Schema migration | Unit tests per version | ✅ Pass |
| Recovery after upgrade | Recovery stress + E2E recovery flag | ✅ Pass |
| 12h–72h soak | `scripts/soak/endurance-runner.mjs` (fast in CI) | ✅ Fast mode pass; manual wall-clock recommended |

---

## Gaps & recommendations

1. **Convert icons** for Windows/macOS store-quality installers.
2. **Run 24h soak** on release hardware before stable channel.
3. **Wire publish config** when ready for beta distribution (not required for private beta).
4. **Expand E2E** for thread lifecycle and native file dialog where feasible.
5. **Sign binaries** (code signing) before wide public download.

---

## Related documents

- [RELEASE-NOTES.md](./RELEASE-NOTES.md)
- [RELEASE-READINESS.md](./RELEASE-READINESS.md)
- [DAILY-DRIVER-SCORECARD.md](./DAILY-DRIVER-SCORECARD.md)
- [BETA-TESTING-GUIDE.md](./BETA-TESTING-GUIDE.md)
