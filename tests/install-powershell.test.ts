import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test"
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { sha256 } from "../src/app/commands/update"
import { compileWindowsFixture, windowsPowerShell } from "./windowsTestHelpers"

const installer = join(import.meta.dir, "../scripts/install.ps1")

describe.skipIf(process.platform !== "win32")("PowerShell installer", () => {
  let fixtures: string
  let binary: string
  let hash: string
  let directory: string
  let installDirectory: string
  let home: string
  let wrapper: string
  let pathMarker: string

  beforeAll(async () => {
    fixtures = await mkdtemp(join(tmpdir(), "noodle-installer-fixture-"))
    binary = join(fixtures, "release.exe")
    await compileWindowsFixture("windowsUpdateReplacement", binary)
    hash = sha256(await readFile(binary))
  }, 120_000)
  afterAll(async () => {
    await rm(fixtures, { recursive: true, force: true })
  })
  beforeEach(async () => {
    directory = await realpath(
      await mkdtemp(join(tmpdir(), "noodle install café-")),
    )
    installDirectory = join(directory, "install")
    home = join(directory, "home")
    pathMarker = join(directory, "user-path")
    wrapper = join(directory, "installer-test.ps1")
    await mkdir(home)
    await writeFile(
      wrapper,
      `
$ErrorActionPreference = "Stop"
function Invoke-WebRequest {
  param([switch]$UseBasicParsing, [string]$Uri, [string]$OutFile)
  [IO.File]::AppendAllText($env:NOODLE_TEST_DOWNLOADS, "$Uri\n")
  if ($env:NOODLE_TEST_DOWNLOAD_FAIL -eq "1") { throw "Download failed" }
  if ($Uri.EndsWith("/SHA256SUMS")) {
    [IO.File]::WriteAllText($OutFile, "$env:NOODLE_TEST_HASH  $env:NOODLE_TEST_ASSET\n")
  } else { [IO.File]::Copy($env:NOODLE_TEST_BINARY, $OutFile) }
}
$code = [IO.File]::ReadAllText($env:NOODLE_TEST_INSTALLER)
$code = $code.Replace('$HOME', '$env:NOODLE_TEST_HOME')
# Intercept registry calls so tests never modify the user's actual PATH.
$code = $code.Replace('[Environment]::GetEnvironmentVariable("Path", "User")', '$env:NOODLE_TEST_USER_PATH')
$code = $code.Replace('[Environment]::SetEnvironmentVariable("Path", ((@($userEntries) + $installDirectory) -join ";"), "User")', '[IO.File]::WriteAllText($env:NOODLE_TEST_PATH_MARKER, ((@($userEntries) + $installDirectory) -join ";"))')
if ($code.Contains('[Environment]::SetEnvironmentVariable')) { throw "User PATH test interception failed" }
if ($env:NOODLE_TEST_LOCK -eq "1") {
  $lock = [IO.File]::Open((Join-Path $env:NOODLE_INSTALL_DIR "noodle.exe"), "Open", "ReadWrite", "None")
}
. ([scriptblock]::Create($code))
`,
    )
  })
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  async function run(environment: Record<string, string | undefined> = {}) {
    const child = Bun.spawn(
      [
        windowsPowerShell,
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        wrapper,
      ],
      {
        env: {
          ...process.env,
          PROCESSOR_ARCHITECTURE: "AMD64",
          PROCESSOR_ARCHITEW6432: undefined,
          NOODLE_INSTALL_DIR: installDirectory,
          NOODLE_VERSION: "v1.2.3",
          NOODLE_SKIP_PATH_UPDATE: "1",
          NOODLE_TEST_INSTALLER: installer,
          NOODLE_TEST_BINARY: binary,
          NOODLE_TEST_HASH: hash,
          NOODLE_TEST_ASSET: "noodle-windows-x86_64.exe",
          NOODLE_TEST_HOME: home,
          HOME: home,
          USERPROFILE: home,
          NOODLE_TEST_DOWNLOADS: join(directory, "downloads"),
          NOODLE_TEST_PATH_MARKER: pathMarker,
          NOODLE_TEST_USER_PATH: "C:\\Windows",
          ...environment,
        },
        stdout: "pipe",
        stderr: "pipe",
      },
    )
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ])
    return { stdout, stderr, exitCode }
  }

  it("installs a verified executable to the x64 per-user default and updates only user PATH", async () => {
    const localAppData = join(directory, "local")
    const expectedDirectory = join(localAppData, "Programs", "Noodle")
    const result = await run({
      NOODLE_INSTALL_DIR: undefined,
      LOCALAPPDATA: localAppData,
      PROCESSOR_ARCHITECTURE: "x86",
      PROCESSOR_ARCHITEW6432: "AMD64",
      NOODLE_SKIP_PATH_UPDATE: "0",
    })
    expect(result.exitCode, `${result.stdout}\n${result.stderr}`).toBe(0)
    expect(sha256(await readFile(join(expectedDirectory, "noodle.exe")))).toBe(
      hash,
    )
    expect(await readFile(pathMarker, "utf8")).toBe(
      `C:\\Windows;${expectedDirectory}`,
    )
    expect(result.stdout).not.toContain("Updated Noodle skill")
    expect(await readFile(join(directory, "downloads"), "utf8")).toContain(
      "/v1.2.3/noodle-windows-x86_64.exe",
    )
  })

  it("supports latest releases without adding a duplicate PATH entry", async () => {
    const result = await run({
      NOODLE_VERSION: undefined,
      NOODLE_SKIP_PATH_UPDATE: "0",
      NOODLE_TEST_USER_PATH: `C:\\Windows;${installDirectory.toUpperCase()}\\`,
    })
    expect(result.exitCode, `${result.stdout}\n${result.stderr}`).toBe(0)
    expect(await Bun.file(pathMarker).exists()).toBe(false)
    expect(await readFile(join(directory, "downloads"), "utf8")).toContain(
      "/latest/download/noodle-windows-x86_64.exe",
    )
  })

  it("rejects native ARM64 before downloads or installation changes", async () => {
    const result = await run({
      PROCESSOR_ARCHITECTURE: "AMD64",
      PROCESSOR_ARCHITEW6432: "ARM64",
    })
    expect(result.exitCode).not.toBe(0)
    expect(result.stderr).toContain("Windows x64 only")
    expect(await Bun.file(join(directory, "downloads")).exists()).toBe(false)
    expect(await Bun.file(join(installDirectory, "noodle.exe")).exists()).toBe(
      false,
    )
  })

  it.each(["checksum", "asset", "download"])(
    "preserves existing binary and PATH after a %s failure",
    async (failure) => {
      await mkdir(installDirectory)
      const destination = join(installDirectory, "noodle.exe")
      await writeFile(destination, "old")
      const result = await run({
        NOODLE_SKIP_PATH_UPDATE: "0",
        ...(failure === "checksum" ? { NOODLE_TEST_HASH: "0".repeat(64) } : {}),
        ...(failure === "asset"
          ? { NOODLE_TEST_ASSET: "noodle-windows-arm64.exe" }
          : {}),
        ...(failure === "download" ? { NOODLE_TEST_DOWNLOAD_FAIL: "1" } : {}),
      })
      expect(result.exitCode).not.toBe(0)
      expect(await readFile(destination, "utf8")).toBe("old")
      expect(await readdir(installDirectory)).toEqual(["noodle.exe"])
      expect(await Bun.file(pathMarker).exists()).toBe(false)
    },
  )

  it("preserves a locked installation and retains its verified recovery candidate", async () => {
    await mkdir(installDirectory)
    const destination = join(installDirectory, "noodle.exe")
    await writeFile(destination, "old")
    const result = await run({
      NOODLE_TEST_LOCK: "1",
      NOODLE_SKIP_PATH_UPDATE: "0",
    })
    expect(result.exitCode).not.toBe(0)
    expect(result.stderr).toContain(
      "Close any running Noodle processes and retry",
    )
    expect(await readFile(destination, "utf8")).toBe("old")
    const candidate = (await readdir(installDirectory)).find((name) =>
      name.startsWith(".noodle-install-"),
    )!
    expect(candidate, `${result.stdout}\n${result.stderr}`).toBeDefined()
    expect(sha256(await readFile(join(installDirectory, candidate)))).toBe(hash)
    expect(await Bun.file(pathMarker).exists()).toBe(false)
  })

  it("restores the previous binary and retains a replacement with the wrong version", async () => {
    await mkdir(installDirectory)
    const destination = join(installDirectory, "noodle.exe")
    await writeFile(destination, "old")
    const result = await run({
      NOODLE_TEST_REPLACEMENT_VERSION: "9.9.9",
      NOODLE_SKIP_PATH_UPDATE: "0",
    })
    expect(result.exitCode).not.toBe(0)
    expect(await readFile(destination, "utf8")).toBe("old")
    const candidate = (await readdir(installDirectory)).find((name) =>
      name.startsWith(".noodle-install-"),
    )!
    expect(candidate, `${result.stdout}\n${result.stderr}`).toBeDefined()
    expect(sha256(await readFile(join(installDirectory, candidate)))).toBe(hash)
    expect(await Bun.file(pathMarker).exists()).toBe(false)
  })

  it.each([false, true])(
    "refreshes an existing skill without rolling back for refresh failure %s",
    async (failed) => {
      await mkdir(join(home, ".agents", "skills", "noodle-use"), {
        recursive: true,
      })
      const marker = join(directory, "skill-refresh.json")
      const result = await run({
        NOODLE_TEST_SKILL_MARKER: marker,
        NOODLE_TEST_SKILL_FAIL: failed ? "1" : "0",
      })
      expect(result.exitCode, `${result.stdout}\n${result.stderr}`).toBe(0)
      expect(sha256(await readFile(join(installDirectory, "noodle.exe")))).toBe(
        hash,
      )
      expect(JSON.parse(await readFile(marker, "utf8"))).toEqual({
        executable: join(installDirectory, "noodle.exe"),
        args: ["agent", "install", "--json"],
      })
      expect(result.stdout).toContain(
        failed ? "Retry with: noodle agent install" : "Updated Noodle skill",
      )
    },
  )
})
