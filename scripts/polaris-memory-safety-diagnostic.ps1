param(
  [string]$ResultPath = "polaris-memory-safety-diagnostic-result.txt",
  [string]$BuildOutputPath = "polaris-memory-safety-diagnostic-build-output.txt"
)

@"
POLARIS DEVELOPER MEMORY SAFETY DIAGNOSTIC
Generated: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")

GOAL:
Run a repeatable developer-only memory safety diagnostic for Polaris.

CHECKS:
1. Hidden context leak scan
2. Validator visibleContent cleanup scan
3. Stream persistence split scan
4. Durable local resume recall scan
5. Required memory/envelope files scan
6. Build check

RULES:
- Static diagnostics plus build only.
- No Ollama calls.
- No cloud AI.
- Do not scrape URLs.

"@ | Set-Content $ResultPath

function Add-Section {
  param([string]$Title)
  "`n============================================================" | Add-Content $ResultPath
  $Title | Add-Content $ResultPath
  "============================================================" | Add-Content $ResultPath
}

function Assert-FileContains {
  param(
    [string]$Path,
    [string]$Needle,
    [string]$Label
  )

  if (!(Test-Path $Path)) {
    "FAIL: $Label — missing file: $Path" | Add-Content $ResultPath
    return $false
  }

  $text = Get-Content $Path -Raw
  if ($text.Contains($Needle)) {
    "PASS: $Label" | Add-Content $ResultPath
    return $true
  } else {
    "FAIL: $Label — missing expected text: $Needle" | Add-Content $ResultPath
    return $false
  }
}

function Assert-FileNotContains {
  param(
    [string]$Path,
    [string]$Needle,
    [string]$Label
  )

  if (!(Test-Path $Path)) {
    "FAIL: $Label — missing file: $Path" | Add-Content $ResultPath
    return $false
  }

  $text = Get-Content $Path -Raw
  if ($text.Contains($Needle)) {
    "FAIL: $Label — found forbidden text: $Needle" | Add-Content $ResultPath
    return $false
  } else {
    "PASS: $Label" | Add-Content $ResultPath
    return $true
  }
}

$Failures = 0
$Warnings = 0

Add-Section "CHECK 1 — HIDDEN CONTEXT LEAK SCAN"

$leakFiles = @(
  "electron/main/providers/ollama-adapter.ts",
  "electron/main/services/workspace-service.ts",
  "src/renderer/src/App.tsx",
  "src/renderer/src/digital-scent-retrieval.ts"
)

$leakTerms = @(
  "scent trace",
  "digital scent",
  "background cognition",
  "hidden prompt",
  "background agent",
  "prefrontal"
)

foreach ($file in $leakFiles) {
  "`nFILE: $file" | Add-Content $ResultPath

  if (!(Test-Path $file)) {
    "FAIL: missing file" | Add-Content $ResultPath
    $Failures++
    continue
  }

  $fileHadLeak = $false

  foreach ($term in $leakTerms) {
    $matches = Select-String -Path $file -Pattern ([regex]::Escape($term)) -CaseSensitive:$false
    if ($matches) {
      $fileHadLeak = $true
      "FAIL: found hidden/internal term: $term" | Add-Content $ResultPath
      $matches | ForEach-Object {
        "  Line $($_.LineNumber): $($_.Line.Trim())" | Add-Content $ResultPath
      }
    }
  }

  if ($fileHadLeak) {
    $Failures++
  } else {
    "PASS: no targeted hidden-context terms found" | Add-Content $ResultPath
  }
}

Add-Section "CHECK 2 — VALIDATOR visibleContent CLEANUP"

$validator = "electron/main/ipc/validate.ts"

$ok = Assert-FileContains $validator "visibleContent?: string" "assertSendMessageInput accepts optional visibleContent"
if (!$ok) { $Failures++ }

$ok = Assert-FileContains $validator "visibleContent," "assertSendMessageInput returns visibleContent"
if (!$ok) { $Failures++ }

if (Test-Path $validator) {
  $visibleContentMatches = Select-String -Path $validator -Pattern "const visibleContent" -CaseSensitive:$false
  "visibleContent extraction count: $($visibleContentMatches.Count)" | Add-Content $ResultPath

  if ($visibleContentMatches.Count -eq 1) {
    "PASS: visibleContent is extracted exactly once" | Add-Content $ResultPath
  } else {
    "FAIL: visibleContent should be extracted exactly once" | Add-Content $ResultPath
    $Failures++
  }
}

Add-Section "CHECK 3 — STREAM PERSISTENCE SPLIT"

$runtime = "electron/main/services/stream-runtime.ts"

$requiredRuntimeTexts = @(
  "visibleContentForPersistence",
  "content: visibleContentForPersistence",
  "modelContextUserMessage",
  "query: visibleContentForPersistence",
  "currentMessage: visibleContentForPersistence"
)

foreach ($needle in $requiredRuntimeTexts) {
  $ok = Assert-FileContains $runtime $needle "stream-runtime contains $needle"
  if (!$ok) { $Failures++ }
}

$ok = Assert-FileNotContains $runtime "content: input.content" "stream-runtime does not directly persist raw input.content"
if (!$ok) { $Failures++ }

Add-Section "CHECK 4 — DURABLE LOCAL RESUME RECALL"

$app = "src/renderer/src/App.tsx"

$requiredAppTexts = @(
  "durableMemoryEventSummary",
  "mergeDurableStructuredMemoryIntoSummary",
  "effectiveContinuitySummary",
  "continuitySummary: effectiveContinuitySummary"
)

foreach ($needle in $requiredAppTexts) {
  $ok = Assert-FileContains $app $needle "App.tsx contains $needle"
  if (!$ok) { $Failures++ }
}

Add-Section "CHECK 5 — STREAM ENVELOPE / PROMPT ENVELOPE FILES"

$requiredFiles = @(
  "src/renderer/src/polaris-prompt-envelope.ts",
  "src/renderer/src/polaris-stream-envelope.ts",
  "src/renderer/src/polaris-memory-recall.ts",
  "src/renderer/src/project-memory-retrieval.ts",
  "src/renderer/src/background-cognition.ts",
  "src/renderer/src/memory-events.ts",
  "src/renderer/src/memory-trust.ts",
  "src/renderer/src/agent-status.ts",
  "src/renderer/src/cognition-memory-event.ts"
)

foreach ($file in $requiredFiles) {
  if (Test-Path $file) {
    "PASS: required file exists: $file" | Add-Content $ResultPath
  } else {
    "FAIL: required file missing: $file" | Add-Content $ResultPath
    $Failures++
  }
}

Add-Section "CHECK 6 — BUILD"

npm run build *> $BuildOutputPath

if ($LASTEXITCODE -eq 0) {
  "PASS: npm run build passed" | Add-Content $ResultPath
} else {
  "FAIL: npm run build failed — see $BuildOutputPath" | Add-Content $ResultPath
  $Failures++
}

Add-Section "FINAL RESULT"

"Failures: $Failures" | Add-Content $ResultPath
"Warnings: $Warnings" | Add-Content $ResultPath

if ($Failures -eq 0) {
  "RESULT: PASS" | Add-Content $ResultPath
  "Polaris memory safety diagnostic passed." | Add-Content $ResultPath
} else {
  "RESULT: FAIL" | Add-Content $ResultPath
  "Review failures above before continuing." | Add-Content $ResultPath
}

"`nDONE." | Add-Content $ResultPath
"Result file: $ResultPath" | Add-Content $ResultPath
"Build output file: $BuildOutputPath" | Add-Content $ResultPath

Get-Content $ResultPath