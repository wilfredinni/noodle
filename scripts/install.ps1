$ErrorActionPreference = "Stop"

$repo = "wilfredinni/noodle"
$version = if ($env:NOODLE_VERSION) { $env:NOODLE_VERSION } else { "latest" }
$installDirectory = if ($env:NOODLE_INSTALL_DIR) {
  $env:NOODLE_INSTALL_DIR
}
else {
  Join-Path $env:LOCALAPPDATA "Programs\Noodle"
}
[string]$nativeArchitecture = if ($env:PROCESSOR_ARCHITEW6432) {
  $env:PROCESSOR_ARCHITEW6432
}
elseif ($env:PROCESSOR_ARCHITECTURE) {
  $env:PROCESSOR_ARCHITECTURE
}
else {
  [Environment]::GetEnvironmentVariable("PROCESSOR_ARCHITECTURE", "Machine")
}
$architecture = switch ($nativeArchitecture.ToUpperInvariant()) {
  "ARM64" { "arm64" }
  "AMD64" { "x86_64" }
  default { throw "Unsupported Windows architecture: $nativeArchitecture" }
}
$assetName = "noodle-windows-$architecture.exe"
$releaseBase = if ($version -eq "latest") {
  "https://github.com/$repo/releases/latest/download"
}
else {
  "https://github.com/$repo/releases/download/$version"
}
$binaryUrl = "$releaseBase/$assetName"
$checksumUrl = "$releaseBase/SHA256SUMS"
$temporaryDirectory = Join-Path ([IO.Path]::GetTempPath()) "noodle-install-$([Guid]::NewGuid().ToString('N'))"
$binaryDownload = Join-Path $temporaryDirectory $assetName
$checksumDownload = Join-Path $temporaryDirectory "SHA256SUMS"
$stagedPath = $null
$backupPath = $null

try {
  New-Item -ItemType Directory -Path $temporaryDirectory -Force | Out-Null
  Write-Host "Installing Noodle $version for windows-$architecture..."
  Invoke-WebRequest -UseBasicParsing -Uri $binaryUrl -OutFile $binaryDownload
  Invoke-WebRequest -UseBasicParsing -Uri $checksumUrl -OutFile $checksumDownload

  $escapedAsset = [Regex]::Escape($assetName)
  $checksumLine = Get-Content -LiteralPath $checksumDownload |
    Where-Object { $_ -match "^([0-9a-fA-F]{64})\s+\*?$escapedAsset$" } |
    Select-Object -First 1
  if (-not $checksumLine) {
    throw "No valid checksum found for $assetName"
  }
  $expectedHash = ($checksumLine -split "\s+")[0].ToLowerInvariant()
  $actualHash = (Get-FileHash -LiteralPath $binaryDownload -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actualHash -ne $expectedHash) {
    throw "Download checksum mismatch"
  }

  New-Item -ItemType Directory -Path $installDirectory -Force | Out-Null
  $destination = Join-Path $installDirectory "noodle.exe"
  $stagedPath = Join-Path $installDirectory ".noodle-install-$([Guid]::NewGuid().ToString('N')).exe"
  Copy-Item -LiteralPath $binaryDownload -Destination $stagedPath

  if ($env:NOODLE_SKIP_PATH_UPDATE -ne "1") {
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    $userEntries = @($userPath -split ";" | Where-Object { $_ })
    if (-not ($userEntries | Where-Object { $_.TrimEnd("\") -ieq $installDirectory.TrimEnd("\") })) {
      $nextUserPath = (@($userEntries) + $installDirectory) -join ";"
      [Environment]::SetEnvironmentVariable("Path", $nextUserPath, "User")
    }
    $processEntries = @($env:Path -split ";" | Where-Object { $_ })
    if (-not ($processEntries | Where-Object { $_.TrimEnd("\") -ieq $installDirectory.TrimEnd("\") })) {
      $env:Path = "$installDirectory;$env:Path"
    }
  }

  if (Test-Path -LiteralPath $destination) {
    $backupPath = Join-Path $installDirectory ".noodle-previous-$([Guid]::NewGuid().ToString('N')).exe"
    [IO.File]::Replace($stagedPath, $destination, $backupPath, $true)
  }
  else {
    [IO.File]::Move($stagedPath, $destination)
  }
  $stagedPath = $null
  if ($backupPath) {
    Remove-Item -LiteralPath $backupPath -Force -ErrorAction SilentlyContinue
    $backupPath = $null
  }

  Write-Host "Installed to $destination"
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

  Write-Host "Run 'noodle --help' to get started."
}
finally {
  if ($stagedPath) {
    Remove-Item -LiteralPath $stagedPath -Force -ErrorAction SilentlyContinue
  }
  if ($backupPath -and (Test-Path -LiteralPath $backupPath)) {
    if (-not (Test-Path -LiteralPath $destination)) {
      Move-Item -LiteralPath $backupPath -Destination $destination -Force -ErrorAction SilentlyContinue
    }
    else {
      Remove-Item -LiteralPath $backupPath -Force -ErrorAction SilentlyContinue
    }
  }
  Remove-Item -LiteralPath $temporaryDirectory -Recurse -Force -ErrorAction SilentlyContinue
}
