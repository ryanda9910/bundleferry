# bundleferry — ferry your project across bundlers (Windows installer). Safe to re-run.
#   irm https://raw.githubusercontent.com/ryanda9910/bundleferry/main/install.ps1 | iex
$ErrorActionPreference = "Stop"
$RAW  = "https://raw.githubusercontent.com/ryanda9910/bundleferry/main/skill/SKILL.md"
$NAME = "bundleferry"

Write-Host "bundleferry - installing the bundler-migration skill"
$skill = (Invoke-WebRequest -UseBasicParsing -Uri $RAW).Content
if (-not $skill) { throw "could not download SKILL.md" }

$installed = $false

# Claude Code - native skill
$claude = Join-Path $HOME ".claude\skills\$NAME"
New-Item -ItemType Directory -Force -Path $claude | Out-Null
Set-Content -Path (Join-Path $claude "SKILL.md") -Value $skill -NoNewline
Write-Host "  + Claude Code   $claude\SKILL.md"
$installed = $true

# Project-local (opt-in: pass -project)
if ($args -contains "-project") {
  $proj = ".claude\skills\$NAME"
  New-Item -ItemType Directory -Force -Path $proj | Out-Null
  Set-Content -Path (Join-Path $proj "SKILL.md") -Value $skill -NoNewline
  Write-Host "  + This project  $proj\SKILL.md"
}

# Other agents that read a rules/AGENTS file
foreach ($d in @(".codex", ".cursor", ".gemini")) {
  $dir = Join-Path $HOME $d
  if (Test-Path $dir) {
    $sub = Join-Path $dir $NAME
    New-Item -ItemType Directory -Force -Path $sub | Out-Null
    Set-Content -Path (Join-Path $sub "$NAME.md") -Value $skill -NoNewline
    Write-Host "  + $d         $sub\$NAME.md"
    $installed = $true
  }
}

Write-Host ""
if ($installed) {
  Write-Host "  Done. Your agent will plan a safe bundler migration before saying ""done""."
  Write-Host "  Force a plan anytime with:  /bundleferry"
}
