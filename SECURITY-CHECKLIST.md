# ContinuityOS Security Checklist

Phase 11 security review — local-first desktop app. Use as pre-release gate; re-run after major changes to export, import, providers, or diagnostics.

## Threat model (summary)

| Asset | Risk | Mitigation |
|-------|------|------------|
| API keys | Exfiltration via DB or logs | `safeStorage` + ref only in SQLite |
| Workspace content | Leak via diagnostics | Bundles exclude message bodies; pattern scan for secrets |
| Backups | Theft of export files | User passphrase encryption |
| Imports | Malicious JSON | Preview, validation, rollback |
| Renderer | RCE via Node | Context isolation, no `nodeIntegration` |

---

## Exports

- [x] Workspace export encrypted with user-provided passphrase
- [x] Export metadata recorded (`last_export_at`, app version) — no content
- [x] Diagnostics export JSON excludes message text
- [x] `assertNoSecretsInDiagnostics` rejects `sk-…` and Bearer token patterns
- [ ] User education: store passphrase separately from backup file (docs)

**Review notes:** Export is user-initiated; no automatic upload. Beta testers should not email raw backups without encryption awareness.

---

## Imports

- [x] Preview before apply
- [x] Rollback path on failure (tested)
- [x] Schema/migration checks on post-import startup
- [ ] Size limits / DoS — monitor very large imports in beta

**Review notes:** Treat unknown backup files as untrusted input.

---

## Provider keys

- [x] Keys stored via Electron `safeStorage` under `userData/secure-secrets/`
- [x] SQLite stores `secure_key_ref` only
- [x] Remove key API clears secure storage ref
- [x] Cloud providers not used for in-app streaming chat (reduces accidental send)

**Review notes:** OS must support `safeStorage`; fallback behavior documented in provider setup errors.

---

## Diagnostics & logs

- [x] Diagnostics panel: no API keys, no passwords
- [x] System health: status labels only, no content
- [x] Crash summary: message scrubbed in bundle (counts/timestamps)
- [x] Daily-driver metrics: counters only in `daily-driver-metrics.json`
- [x] No cloud telemetry pipeline

**Review notes:** Users can still manually paste secrets into threads — out of scope for automatic scrub in DB.

---

## IPC & renderer

- [x] Preload bridge exposes allowlisted APIs only
- [x] IPC validation layer for payloads
- [x] Renderer cannot read filesystem directly

---

## Database

- [x] Migrations versioned; downgrade detected
- [x] Recovery mode for corrupt/missing DB
- [ ] File permissions on userData — OS-dependent (user responsibility on shared machines)

---

## Dependencies

- [ ] Run `npm audit` before public release
- [ ] Pin critical deps for reproducible builds
- [ ] Electron version tracked for security advisories

---

## Release & distribution (future)

- [ ] Code signing (Windows/macOS)
- [ ] Notarization (macOS)
- [ ] HTTPS-only download hosting
- [ ] Checksum published with releases

---

## Beta tester guidance

Include in reports:

- Diagnostics JSON (not full encrypted backup unless requested)
- Never share export passphrase in plain text channels

See [BETA-TESTING-GUIDE.md](./BETA-TESTING-GUIDE.md).

---

## Sign-off

| Area | Status | Date |
|------|--------|------|
| Exports/imports | Reviewed | 2026-05-28 |
| Provider keys | Reviewed | 2026-05-28 |
| Diagnostics | Reviewed (Phase 11 health expansion) | 2026-05-28 |
| Cloud telemetry | N/A — not implemented | 2026-05-28 |

**Overall:** Suitable for **closed beta** with documented limitations in [KNOWN-ISSUES.md](./KNOWN-ISSUES.md).
