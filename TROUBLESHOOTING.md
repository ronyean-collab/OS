# Troubleshooting

Quick fixes for common ContinuityOS Desktop problems. All diagnostics stay **local** — export bundles only when you choose to share them with support.

## App will not start

1. **Check recovery mode** — if SQLite is corrupt, the app may open in recovery UI. Follow on-screen guidance.
2. **Antivirus / permissions** — ensure ContinuityOS can write to its user data folder.
3. **Downgrade** — if you opened the database with a **newer** build then launched an **older** build, update to the latest version or restore from backup.
4. **Last resort** — rename (do not delete) the user data folder after exporting a backup, then reinstall for a clean profile.

## Onboarding stuck

| Symptom | Fix |
|---------|-----|
| Cannot pass connection test | Start Ollama (`ollama serve`) and pull a model (`ollama pull llama3.2`) |
| Want to skip Ollama | Choose Manual Mode / set up later — no connection test required |
| Continue disabled on step 1 | Select a provider card first |

## Ollama / in-app chat

- **“Connection failed”** — verify Ollama is running at the URL shown in Providers (default `http://127.0.0.1:11434`).
- **Slow or empty replies** — check model is pulled and GPU/CPU resources are available.
- **Cancel not working** — wait a few seconds; partial text should remain in the thread.

## Manual Mode

- Use **Copy context pack** from the chat toolbar.
- Paste into your external AI; paste the reply into the composer.
- API keys for cloud providers are optional and only used for pack-related tooling in Project tools — not for in-app streaming.

## Backups

| Symptom | Fix |
|---------|-----|
| Export does nothing | Check disk space and download folder permissions; try Export again from Backups |
| Import preview looks wrong | Cancel import — do not confirm |
| Import failed mid-way | App should roll back; restart and verify Diagnostics → migration health |
| Forgot export password | Cannot decrypt — keep passphrase with backup files |

## Messages missing or duplicated

1. Open **Diagnostics** → check **System health** (recovery, migration).
2. If **orphaned messages** appear, use the repair action only after reading the preview.
3. Restore from last good **encrypted backup** if integrity scan shows errors.

## Performance

- Close unused threads/workspaces.
- Export and archive old projects manually (future archival UX may improve).
- On Windows, exclude user data folder from real-time scanning if legitimate performance issues occur.

## Diagnostics & logs

1. **Project tools → Diagnostics**
2. Review **System health**: runtime, recovery, provider, startup, migration
3. **Copy** or **Export JSON** for support

Exported JSON excludes message bodies and API keys by design.

## Getting more help

1. Read [KNOWN-ISSUES.md](./KNOWN-ISSUES.md)
2. Follow [BETA-TESTING-GUIDE.md](./BETA-TESTING-GUIDE.md) for issue reports
3. Run `npm test` (developers) if building from source
