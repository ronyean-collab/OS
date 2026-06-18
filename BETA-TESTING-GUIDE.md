# ContinuityOS Beta Testing Guide

Thank you for helping validate ContinuityOS before wider release. This guide covers installation, onboarding, providers, backups, recovery, and how to report issues.

## What you are testing

ContinuityOS is a **local-first continuity workspace** — not a cloud chat clone. You are validating:

- Onboarding clarity (Ollama vs Manual Mode)
- Thread/chat persistence and recovery
- Backup export/import
- Upgrade and migration safety
- Diagnostics (local only — no telemetry sent to us automatically)

## Installation

### From source (developers & technical beta testers)

```bash
git clone <repository-url>
cd continuity-os-desktop
npm install
npm run dev
```

### From a packaged build (when provided)

1. Download the installer for your OS (Windows NSIS, macOS DMG, or Linux AppImage).
2. Run the installer; launch **ContinuityOS**.
3. On first launch, allow the app through any firewall prompts if you use **Ollama** locally.

**Data location:** Electron stores your database under the app user data folder (OS-specific). Do not delete this folder if you want to keep workspaces.

## Onboarding

1. **Welcome** — read the provider choice carefully.
2. **Ollama (recommended for in-app chat)** — requires [Ollama](https://ollama.com) installed and running. Complete connection test before entering workspace.
3. **Manual Mode / “Set up later”** — no API key required. Use context packs with ChatGPT, Claude, Gemini, or any AI; paste replies back into ContinuityOS.
4. **Continuity ready** — confirms local persistence is active.
5. **Enter workspace** — you land in your first project.

**Tip for non-technical testers:** If you do not run local AI, choose Manual Mode. You can still organize threads, export backups, and use continuity features.

## Providers

| Mode | In-app chat | Cloud API in app |
|------|-------------|------------------|
| **Ollama** | Yes (local) | No |
| **Manual Mode** | Copy/paste via context packs | Optional keys in Project tools for pack generation only |

Cloud providers (OpenAI, Anthropic, etc.) are **not** used for in-app streaming chat by design. This keeps the product local-first and avoids accidental data egress.

To change providers later: **Project tools → Providers**.

## Backups

1. Open **Project tools → Backups**.
2. **Export backup** — saves an encrypted JSON bundle to disk.
3. Store backups on external drive or cloud storage **you control** (ContinuityOS does not auto-upload).
4. **Import backup** — always review the preview; cancel if counts look wrong.

**Beta expectation:** Export after meaningful sessions (end of day or before upgrades).

## Recovery

ContinuityOS handles:

- **Interrupted streams** — partial assistant messages may be recoverable
- **Recovery mode** — if the database fails to open, the app may start in a limited recovery UI
- **Import rollback** — failed imports should not corrupt the prior database

If you see “Recovery mode” in Diagnostics:

1. Do not delete user data blindly.
2. Export diagnostics (Project tools → Diagnostics → Export bundle).
3. Report the issue with the JSON bundle attached.

## Reporting issues

Include:

1. **App version** (Settings or Diagnostics panel)
2. **OS** (Windows/macOS/Linux + version)
3. **Steps to reproduce**
4. **Expected vs actual**
5. **Diagnostics bundle** (JSON export — no message content inside)
6. **Screenshot** if UI-related

**Do not send:** API keys, full backup files with sensitive content, or unrelated system passwords.

File issues via your beta channel (GitHub Issues, email, or Discord — as directed by the team).

## What not to expect in beta

- Cloud sync between devices
- Multi-user collaboration
- Agents or autonomous tool loops
- Billing or marketplace
- Plugin ecosystem

## Recommended test scenarios

1. Fresh install → onboarding → send 5 messages → restart app → messages persist
2. Export backup → reset or new profile → import → verify thread counts
3. Start a long Ollama reply → force-quit app → reopen → check recovery banner
4. Manual Mode: copy context pack → paste external reply → verify thread continuity
5. Open Diagnostics → confirm System health section shows migration/startup healthy

## Related docs

- [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)
- [KNOWN-ISSUES.md](./KNOWN-ISSUES.md)
- [SECURITY-CHECKLIST.md](./SECURITY-CHECKLIST.md)
