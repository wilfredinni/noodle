import { describe, expect, it } from "bun:test"
import { createHash } from "node:crypto"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { powershellTestTimeout, runPowerShell } from "./powershell"

const describeWindows = describe.skipIf(process.platform !== "win32")
const installer = join(import.meta.dir, "../scripts/install.ps1")
const architecture = process.arch === "arm64" ? "arm64" : "x86_64"
const assetName = `noodle-windows-${architecture}.exe`

async function runInstaller(
  root: string,
  binary: string,
  checksum: string,
  options: {
    defaultDirectory?: boolean
    updatePath?: boolean
    clearArchitecture?: boolean
  } = {},
) {
  const binaryFixture = join(root, "binary.exe")
  const checksumFixture = join(root, "SHA256SUMS")
  const driver = join(root, "driver.ps1")
  const requestLog = join(root, "requests.log")
  const installDirectory = join(root, "install")
  const pathLog = join(root, "paths.log")
  await writeFile(binaryFixture, binary)
  await writeFile(
    checksumFixture,
    ["arm64", "x86_64"]
      .map((arch) => `${checksum}  noodle-windows-${arch}.exe\n`)
      .join(""),
  )
  await writeFile(
    driver,
    `$ErrorActionPreference = "Stop"
$env:PROCESSOR_ARCHITECTURE = ${options.clearArchitecture ? "$null" : `'${process.arch === "arm64" ? "ARM64" : "AMD64"}'`}
Remove-Item Env:PROCESSOR_ARCHITEW6432 -ErrorAction SilentlyContinue
$originalUserPath = [Environment]::GetEnvironmentVariable("Path", "User")
function Invoke-WebRequest {
  param([string]$Uri, [string]$OutFile, [switch]$UseBasicParsing)
  Add-Content -LiteralPath $env:NOODLE_REQUEST_LOG -Value $Uri
  if ($Uri.EndsWith("SHA256SUMS")) {
    Copy-Item -LiteralPath $env:NOODLE_TEST_CHECKSUM -Destination $OutFile
  } else {
    Copy-Item -LiteralPath $env:NOODLE_TEST_BINARY -Destination $OutFile
  }
}
try {
  . $env:NOODLE_INSTALL_SCRIPT
  if ($env:NOODLE_PATH_LOG) {
    Set-Content -Encoding UTF8 -LiteralPath $env:NOODLE_PATH_LOG -Value @(
      $env:Path,
      [Environment]::GetEnvironmentVariable("Path", "User")
    )
  }
}
finally {
  if ($env:NOODLE_PATH_LOG) {
    [Environment]::SetEnvironmentVariable("Path", $originalUserPath, "User")
  }
}
`,
  )
  return runPowerShell(["-File", driver], {
    ...process.env,
    NOODLE_INSTALL_SCRIPT: installer,
    NOODLE_INSTALL_DIR: options.defaultDirectory ? undefined : installDirectory,
    NOODLE_VERSION: "v1.2.3",
    NOODLE_SKIP_PATH_UPDATE: options.updatePath ? "0" : "1",
    NOODLE_PATH_LOG: options.updatePath ? pathLog : undefined,
    NOODLE_REQUEST_LOG: requestLog,
    NOODLE_TEST_BINARY: binaryFixture,
    NOODLE_TEST_CHECKSUM: checksumFixture,
    LOCALAPPDATA: root,
    HOME: root,
    USERPROFILE: root,
  })
}

function expectSuccess(result: Awaited<ReturnType<typeof runPowerShell>>) {
  expect(
    result.exitCode,
    result.stderr?.toString() || result.stdout?.toString() || "",
  ).toBe(0)
}

describeWindows("PowerShell installer", () => {
  it.each([false, true])(
    "installs the selected architecture (missing process architecture: %s)",
    async (clearArchitecture) => {
      const root = await mkdtemp(join(tmpdir(), "noodle-install-ps-"))
      const binary = "windows release binary\n"
      try {
        let expectedAsset = assetName
        if (clearArchitecture) {
          const machine = await runPowerShell([
            "-Command",
            "[Environment]::GetEnvironmentVariable('PROCESSOR_ARCHITECTURE', 'Machine')",
          ])
          expectSuccess(machine)
          expect(["ARM64", "AMD64"]).toContain(machine.stdout.trim())
          expectedAsset = `noodle-windows-${machine.stdout.trim() === "ARM64" ? "arm64" : "x86_64"}.exe`
        }
        const checksum = createHash("sha256").update(binary).digest("hex")
        const result = await runInstaller(root, binary, checksum, {
          defaultDirectory: true,
          clearArchitecture,
        })

        expectSuccess(result)
        expect(
          await readFile(
            join(root, "Programs", "Noodle", "noodle.exe"),
            "utf8",
          ),
        ).toBe(binary)
        const requests = await readFile(join(root, "requests.log"), "utf8")
        expect(requests).toContain(`/v1.2.3/${expectedAsset}`)
        expect(requests).toContain("/v1.2.3/SHA256SUMS")
      } finally {
        await rm(root, { recursive: true, force: true })
      }
    },
    powershellTestTimeout,
  )

  it(
    "adds the install directory to the process and user PATH",
    async () => {
      const root = await mkdtemp(join(tmpdir(), "noodle-install-ps-path-"))
      const binary = "windows release binary\n"
      try {
        const checksum = createHash("sha256").update(binary).digest("hex")
        const result = await runInstaller(root, binary, checksum, {
          updatePath: true,
        })

        expectSuccess(result)
        const paths = (await readFile(join(root, "paths.log"), "utf8"))
          .split(/\r?\n/)
          .filter(Boolean)
        expect(paths).toHaveLength(2)
        expect(paths[0]).toContain(join(root, "install"))
        expect(paths[1]).toContain(join(root, "install"))
      } finally {
        await rm(root, { recursive: true, force: true })
      }
    },
    powershellTestTimeout,
  )

  it(
    "preserves an existing installation when checksum verification fails",
    async () => {
      const root = await mkdtemp(join(tmpdir(), "noodle-install-ps-fail-"))
      const installDirectory = join(root, "install")
      try {
        await mkdir(installDirectory, { recursive: true })
        await writeFile(join(installDirectory, "noodle.exe"), "old")
        const result = await runInstaller(root, "new", "0".repeat(64))

        expect(result.exitCode).toBe(1)
        expect(result.stderr).toContain("Download checksum mismatch")
        expect(
          await readFile(join(installDirectory, "noodle.exe"), "utf8"),
        ).toBe("old")
      } finally {
        await rm(root, { recursive: true, force: true })
      }
    },
    powershellTestTimeout,
  )

  it(
    "keeps installation successful when skill refresh fails",
    async () => {
      const root = await mkdtemp(join(tmpdir(), "noodle-install-ps-skill-"))
      const binary = "not a runnable executable"
      try {
        await mkdir(join(root, ".agents", "skills", "noodle-use"), {
          recursive: true,
        })
        const checksum = createHash("sha256").update(binary).digest("hex")
        const installed = await runInstaller(root, binary, checksum)
        expectSuccess(installed)
        expect(installed.stdout?.toString() ?? "").toContain(
          "skill could not be refreshed",
        )
      } finally {
        await rm(root, { recursive: true, force: true })
      }
    },
    powershellTestTimeout,
  )
})
