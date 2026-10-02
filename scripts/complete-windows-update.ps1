#requires -Version 5.1
param(
  [Parameter(Mandatory = $true)][int]$ParentPid,
  [Parameter(Mandatory = $true)][string]$Source,
  [Parameter(Mandatory = $true)][string]$Destination,
  [Parameter(Mandatory = $true)][string]$Version,
  [Parameter(Mandatory = $true)][ValidatePattern('^[a-fA-F0-9]{64}$')][string]$ExpectedSha256,
  [Parameter(Mandatory = $true)][string]$LogPath,
  [switch]$RefreshSkill,
  [ValidateRange(1, 100)][int]$MaxAttempts = 100
)

$ErrorActionPreference = "Stop"
$stagingDirectory = Split-Path -Parent $Source
$backup = Join-Path $stagingDirectory "previous-noodle.exe"
$replaced = $false
$hadDestination = $false

function Write-UpdateLog([string]$Message) {
  try {
    [IO.File]::AppendAllText($LogPath, "$Message`r`n", [Text.UTF8Encoding]::new($false))
  }
  catch {
    [Console]::Error.WriteLine($Message)
  }
}

try {
  # A PowerShell 7 parent can pass incompatible module paths through Bun.
  Import-Module "$PSHOME\Modules\Microsoft.PowerShell.Utility" -ErrorAction Stop
  Wait-Process -Id $ParentPid -ErrorAction SilentlyContinue
  $actualHash = (Get-FileHash -LiteralPath $Source -Algorithm SHA256).Hash
  if ($actualHash -ine $ExpectedSha256) {
    throw "Staged update checksum mismatch"
  }

  $hadDestination = Test-Path -LiteralPath $Destination -PathType Leaf
  Write-UpdateLog "Applying update $Version."
  $lastReplacementError = "the executable remained locked"
  for ($attempt = 0; $attempt -lt $MaxAttempts; $attempt += 1) {
    try {
      if (Test-Path -LiteralPath $Destination -PathType Leaf) {
        [IO.File]::Replace($Source, $Destination, $backup, $false)
      }
      else {
        [IO.File]::Move($Source, $Destination)
      }
      $replaced = $true
      break
    }
    catch {
      $lastReplacementError = $_.Exception.Message
      # ReplaceFile can move the old executable to its backup before failing.
      if ((-not (Test-Path -LiteralPath $Destination)) -and (Test-Path -LiteralPath $backup -PathType Leaf)) {
        [IO.File]::Move($backup, $Destination)
      }
      if ($attempt + 1 -lt $MaxAttempts) {
        Start-Sleep -Milliseconds 100
      }
    }
  }
  if (-not $replaced) {
    throw "Unable to replace noodle.exe after $MaxAttempts attempts. $lastReplacementError"
  }

  $versionOutput = & $Destination --version 2>&1
  if ($LASTEXITCODE -ne 0 -or ($versionOutput -join "`n").Trim() -cne $Version.TrimStart('v')) {
    throw "The installed executable did not report the expected version $Version"
  }
  Write-UpdateLog "Noodle updated to $Version."

  if ($RefreshSkill) {
    try {
      & $Destination agent install --json *> $null
      if ($LASTEXITCODE -ne 0) { throw "skill installer exited $LASTEXITCODE" }
      Write-UpdateLog "Noodle skill updated."
    }
    catch {
      Write-UpdateLog "Warning: Noodle updated, but its skill could not be refreshed. Retry with: noodle agent install"
    }
  }

  Remove-Item -LiteralPath $stagingDirectory -Recurse -Force -ErrorAction SilentlyContinue
  Write-UpdateLog "Update complete."
  exit 0
}
catch {
  $updateError = $_.Exception.Message
  try {
    if (Test-Path -LiteralPath $backup -PathType Leaf) {
      if ($replaced -and (Test-Path -LiteralPath $Destination -PathType Leaf)) {
        [IO.File]::Replace($backup, $Destination, $Source, $false)
      }
      elseif (-not (Test-Path -LiteralPath $Destination)) {
        [IO.File]::Move($backup, $Destination)
      }
    }
    elseif ($replaced -and -not $hadDestination) {
      [IO.File]::Move($Destination, $Source)
    }
  }
  catch {
    Write-UpdateLog "Rollback failed: $($_.Exception.Message)"
  }
  Write-UpdateLog "Failed to finish the Noodle update: $updateError"
  Write-UpdateLog "Recovery files were retained in $stagingDirectory. Close Noodle and retry the update."
  exit 1
}
