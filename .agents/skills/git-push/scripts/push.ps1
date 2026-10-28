<#
.SYNOPSIS
  Automated pre-flight validation, commit, and git push script.
.PARAMETER Message
  The commit message. If omitted, prompts or uses a default.
#>
param(
  [string]$Message = ""
)

$ErrorActionPreference = "Stop"

Write-Host "==> [1/4] Running Project Verification..." -ForegroundColor Cyan
if (Test-Path "package.json") {
  $packageJson = Get-Content "package.json" -Raw | ConvertFrom-Json
  if ($packageJson.scripts.lint) {
    Write-Host "  -> Running npm run lint..."
    npm run lint
  }
  if ($packageJson.scripts.build) {
    Write-Host "  -> Running npm run build..."
    npm run build
  }
}

Write-Host "`n==> [2/4] Staging Changes..." -ForegroundColor Cyan
git add -A
git status -s

if ([string]::IsNullOrWhiteSpace($Message)) {
  $Message = "chore: update codebase $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
}

Write-Host "`n==> [3/4] Committing Changes..." -ForegroundColor Cyan
git commit -m "$Message"

$branch = (git branch --show-current).Trim()
if ([string]::IsNullOrWhiteSpace($branch)) {
  $branch = "main"
}

Write-Host "`n==> [4/4] Pushing to origin $branch..." -ForegroundColor Cyan
git push origin $branch

Write-Host "`n✔ Successfully pushed changes to origin/$branch!" -ForegroundColor Green
