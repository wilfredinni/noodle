#requires -Version 5.1
$ErrorActionPreference = "Stop"

$repo = "wilfredinni/noodle"
$version = if ($env:NOODLE_VERSION) { $env:NOODLE_VERSION } else { "latest" }
$installDirectory = if ($env:NOODLE_INSTALL_DIR) {
  [IO.Path]::GetFullPath($env:NOODLE_INSTALL_DIR)
}
else {
  Join-Path $env:LOCALAPPDATA "Programs\Noodle"
}
$nativeArchitecture = if ($env:PROCESSOR_ARCHITEW6432) {
  $env:PROCESSOR_ARCHITEW6432
}
else {
  $env:PROCESSOR_ARCHITECTURE
}
if ($nativeArchitecture -ine "AMD64") {
  throw "Unsupported Windows architecture: $nativeArchitecture. Noodle currently supports Windows x64 only."
}
$assetName = "noodle-windows-x86_64.exe"
$releaseBase = if ($version -eq "latest") {
  "https://github.com/$repo/releases/latest/download"
}
else {
  "https://github.com/$repo/releases/download/$version"
}
$temporaryDirectory = Join-Path ([IO.Path]::GetTempPath()) "noodle-install-$([Guid]::NewGuid().ToString('N'))"
$binaryDownload = Join-Path $temporaryDirectory $assetName
$checksumDownload = Join-Path $temporaryDirectory "SHA256SUMS"
$destination = Join-Path $installDirectory "noodle.exe"
$stagedPath = $null
$backupPath = $null
$replaced = $false
$hadDestination = $false
$preserveRecovery = $false

try {
  # A PowerShell 7 parent can pass incompatible module paths through Bun.
  Import-Module "$PSHOME\Modules\Microsoft.PowerShell.Utility" -ErrorAction Stop
  New-Item -ItemType Directory -Path $temporaryDirectory -Force | Out-Null
  Write-Host "Installing Noodle $version for windows-x86_64..."
  Invoke-WebRequest -UseBasicParsing -Uri "$releaseBase/$assetName" -OutFile $binaryDownload
  Invoke-WebRequest -UseBasicParsing -Uri "$releaseBase/SHA256SUMS" -OutFile $checksumDownload

  $escapedAsset = [Regex]::Escape($assetName)
  $checksumLine = Get-Content -LiteralPath $checksumDownload |
    Where-Object { $_ -match "^([0-9a-fA-F]{64})\s+\*?$escapedAsset$" } |
    Select-Object -First 1
  if (-not $checksumLine) { throw "No valid checksum found for $assetName" }
  $expectedHash = ($checksumLine -split "\s+")[0]
  $actualHash = (Get-FileHash -LiteralPath $binaryDownload -Algorithm SHA256).Hash
  if ($actualHash -ine $expectedHash) { throw "Download checksum mismatch" }

  New-Item -ItemType Directory -Path $installDirectory -Force | Out-Null
  $stagedPath = Join-Path $installDirectory ".noodle-install-$([Guid]::NewGuid().ToString('N')).exe"
  Copy-Item -LiteralPath $binaryDownload -Destination $stagedPath
  $hadDestination = Test-Path -LiteralPath $destination -PathType Leaf
  if ($hadDestination) {
    $backupPath = Join-Path $installDirectory ".noodle-previous-$([Guid]::NewGuid().ToString('N')).exe"
    [IO.File]::Replace($stagedPath, $destination, $backupPath, $false)
  }
  else {
    [IO.File]::Move($stagedPath, $destination)
  }
  $replaced = $true

  $versionOutput = & $destination --version 2>&1
  $installedVersion = ($versionOutput -join "`n").Trim()
  if ($LASTEXITCODE -ne 0 -or $installedVersion -cnotmatch '^\d+\.\d+\.\d+$' -or ($version -ne "latest" -and $installedVersion -cne $version.TrimStart('v'))) {
    throw "The installed executable did not report the expected version $version"
  }
  if ($backupPath) {
    Remove-Item -LiteralPath $backupPath -Force
    $backupPath = $null
  }
  $stagedPath = $null
  $replaced = $false
  Write-Host "Installed to $destination"

  if ($env:NOODLE_SKIP_PATH_UPDATE -ne "1") {
    try {
      $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
      $userEntries = @($userPath -split ";" | Where-Object { $_ })
      if (-not ($userEntries | Where-Object { $_.TrimEnd("\") -ieq $installDirectory.TrimEnd("\") })) {
        [Environment]::SetEnvironmentVariable("Path", ((@($userEntries) + $installDirectory) -join ";"), "User")
      }
      $processEntries = @($env:Path -split ";" | Where-Object { $_ })
      if (-not ($processEntries | Where-Object { $_.TrimEnd("\") -ieq $installDirectory.TrimEnd("\") })) {
        $env:Path = "$installDirectory;$env:Path"
      }
    }
    catch {
      Write-Warning "Noodle was installed, but its directory could not be added to your user PATH. Add $installDirectory to PATH manually."
    }
  }

  $skillPaths = @(
    (Join-Path $HOME ".agents\skills\noodle-use"),
    (Join-Path $HOME ".claude\skills\noodle-use"),
    (Join-Path $HOME ".cursor\skills\noodle-use"),
    (Join-Path $HOME ".codex\skills\noodle-use"),
    (Join-Path $HOME ".config\opencode\skills\noodle-use")
  )
  if ($skillPaths | Where-Object { Test-Path -LiteralPath $_ }) {
    try {
      & $destination agent install --json *> $null
      if ($LASTEXITCODE -ne 0) { throw "skill installer exited $LASTEXITCODE" }
      Write-Host "Updated Noodle skill."
    }
    catch {
      Write-Warning "Noodle was installed, but its skill could not be refreshed. Retry with: noodle agent install"
    }
  }
  Write-Host "Run 'noodle --help' to get started. Open a new terminal if your PATH changed."
}
catch {
  $installError = $_.Exception.Message
  $preserveRecovery = $null -ne $stagedPath
  try {
    if ($backupPath -and (Test-Path -LiteralPath $backupPath -PathType Leaf)) {
      if ($replaced -and (Test-Path -LiteralPath $destination -PathType Leaf)) {
        [IO.File]::Replace($backupPath, $destination, $stagedPath, $false)
      }
      elseif (-not (Test-Path -LiteralPath $destination)) {
        [IO.File]::Move($backupPath, $destination)
      }
    }
    elseif ($replaced -and -not $hadDestination) {
      [IO.File]::Move($destination, $stagedPath)
    }
  }
  catch {
    [Console]::Error.WriteLine("Rollback failed: $($_.Exception.Message)")
  }
  [Console]::Error.WriteLine("Failed to install Noodle: $installError. Close any running Noodle processes and retry.")
  if ($preserveRecovery) {
    [Console]::Error.WriteLine("Recovery files were retained in $installDirectory.")
  }
  exit 1
}
finally {
  if (-not $preserveRecovery -and $stagedPath) {
    Remove-Item -LiteralPath $stagedPath -Force -ErrorAction SilentlyContinue
  }
  Remove-Item -LiteralPath $temporaryDirectory -Recurse -Force -ErrorAction SilentlyContinue
}
