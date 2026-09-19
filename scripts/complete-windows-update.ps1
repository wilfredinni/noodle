param(
  [Parameter(Mandatory = $true)][int]$ParentPid,
  [Parameter(Mandatory = $true)][string]$Source,
  [Parameter(Mandatory = $true)][string]$Destination,
  [Parameter(Mandatory = $true)][string]$Version,
  [switch]$RefreshSkill,
  [int]$MaxAttempts = 100
)

$ErrorActionPreference = "Stop"
$stagingDirectory = Split-Path -Parent $Source
$backup = Join-Path $stagingDirectory "previous-noodle.exe"

try {
  Wait-Process -Id $ParentPid -ErrorAction SilentlyContinue
  $installed = $false
  for ($attempt = 0; $attempt -lt $MaxAttempts; $attempt += 1) {
    try {
      if (Test-Path -LiteralPath $Destination) {
        [IO.File]::Replace($Source, $Destination, $backup, $true)
      }
      else {
        [IO.File]::Move($Source, $Destination)
      }
      $installed = $true
      break
    }
    catch {
      Start-Sleep -Milliseconds 100
    }
  }
  if (-not $installed) {
    throw "the executable remained locked"
  }

  Write-Host "Noodle updated to $Version."
  if ($RefreshSkill) {
    try {
      & $Destination agent install --json *> $null
      if ($LASTEXITCODE -ne 0) { throw "skill installer exited $LASTEXITCODE" }
    }
    catch {
      Write-Warning "Noodle updated, but its skill could not be refreshed. Retry with: noodle agent install"
    }
  }

  Remove-Item -LiteralPath $backup -Force -ErrorAction SilentlyContinue
  if ((Split-Path -Parent $PSCommandPath) -eq $stagingDirectory) {
    Remove-Item -LiteralPath $PSCommandPath -Force -ErrorAction SilentlyContinue
  }
  Remove-Item -LiteralPath $stagingDirectory -Recurse -Force -ErrorAction SilentlyContinue
}
catch {
  Write-Error "Failed to finish the Noodle update. The verified binary remains at ${Source}. $($_.Exception.Message)"
  exit 1
}
