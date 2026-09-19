import { describe, expect, it } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { randomUUID } from "node:crypto"
import {
  powershellArgs,
  powershellTestTimeout,
  runPowerShell,
} from "./powershell"

const describeWindows = describe.skipIf(process.platform !== "win32")
const helper = join(import.meta.dir, "../scripts/complete-windows-update.ps1")

function runHelper(
  source: string,
  destination: string,
  maxAttempts = 1,
  script = helper,
  refreshSkill = false,
) {
  const args = [
    "-File",
    script,
    "-ParentPid",
    "2147483647",
    "-Source",
    source,
    "-Destination",
    destination,
    "-Version",
    "v1.2.3",
    "-MaxAttempts",
    String(maxAttempts),
  ]
  if (refreshSkill) args.push("-RefreshSkill")
  return runPowerShell(args)
}

describeWindows("Windows update helper", () => {
  it(
    "replaces the executable and removes successful staging",
    async () => {
      const root = await mkdtemp(join(tmpdir(), "noodle-update-helper-"))
      const stage = join(root, "stage")
      const source = join(stage, "noodle-windows-x86_64.exe")
      const stagedHelper = join(stage, "complete-update.ps1")
      const destination = join(root, "noodle.exe")
      try {
        await mkdir(stage)
        await Bun.write(source, "new")
        await writeFile(stagedHelper, await readFile(helper))
        await writeFile(destination, "old")

        const result = await runHelper(source, destination, 1, stagedHelper)

        expect(result.exitCode).toBe(0)
        expect(await readFile(destination, "utf8")).toBe("new")
        expect(await Bun.file(stage).exists()).toBe(false)
      } finally {
        await rm(root, { recursive: true, force: true })
      }
    },
    powershellTestTimeout,
  )

  it(
    "preserves staging when replacement fails",
    async () => {
      const root = await mkdtemp(join(tmpdir(), "noodle-update-helper-fail-"))
      const stage = join(root, "stage")
      const source = join(stage, "noodle-windows-x86_64.exe")
      const stagedHelper = join(stage, "complete-update.ps1")
      try {
        await mkdir(stage)
        await Bun.write(source, "new")
        await writeFile(stagedHelper, await readFile(helper))
        const result = await runHelper(
          source,
          join(root, "missing", "noodle.exe"),
          1,
          stagedHelper,
        )

        expect(result.exitCode).toBe(1)
        expect(await readFile(source, "utf8")).toBe("new")
        expect(await Bun.file(stagedHelper).exists()).toBe(true)
        expect(result.stderr.toString()).toContain("verified binary remains")
      } finally {
        await rm(root, { recursive: true, force: true })
      }
    },
    powershellTestTimeout,
  )

  it(
    "retries a temporarily locked executable",
    async () => {
      const root = await mkdtemp(join(tmpdir(), "noodle-update-helper-retry-"))
      const stage = join(root, "stage")
      const source = join(stage, "noodle-windows-x86_64.exe")
      const destination = join(root, "noodle.exe")
      const lockerScript = join(root, "lock.ps1")
      const retryScript = join(root, "retry.ps1")
      const releaseEvent = `Local\\noodle-update-test-${randomUUID()}`
      let locker: ReturnType<typeof Bun.spawn> | undefined
      try {
        await mkdir(stage)
        await writeFile(source, "new")
        await writeFile(destination, "old")
        await writeFile(
          lockerScript,
          `param([string]$Target, [string]$ReleaseEvent)
$ErrorActionPreference = "Stop"
$release = [Threading.EventWaitHandle]::new($false, "ManualReset", $ReleaseEvent)
$stream = [IO.File]::Open($Target, "Open", "ReadWrite", "None")
try {
  [Console]::Out.WriteLine("locked")
  [Console]::Out.Flush()
  if (-not $release.WaitOne(20000)) { throw "The helper never retried" }
} finally {
  $stream.Dispose()
  $release.Dispose()
}
`,
        )
        await writeFile(
          retryScript,
          `param([int]$ParentPid, [string]$Source, [string]$Destination, [string]$Version, [int]$MaxAttempts)
$release = [Threading.EventWaitHandle]::OpenExisting('${releaseEvent}')
function Start-Sleep {
  param([int]$Milliseconds)
  $release.Set() | Out-Null
  Microsoft.PowerShell.Utility\\Start-Sleep -Milliseconds $Milliseconds
}
try { . '${helper.replaceAll("'", "''")}' @PSBoundParameters }
finally { $release.Dispose() }
`,
        )
        locker = Bun.spawn(
          [
            ...powershellArgs,
            "-File",
            lockerScript,
            "-Target",
            destination,
            "-ReleaseEvent",
            releaseEvent,
          ],
          { stdin: "ignore", stdout: "pipe", stderr: "pipe", timeout: 20_000 },
        )
        const output = locker.stdout as ReadableStream<Uint8Array>
        const reader = output.getReader()
        let ready = ""
        try {
          while (!ready.includes("\n")) {
            const { done, value } = await reader.read()
            if (done) break
            ready += new TextDecoder().decode(value)
          }
        } finally {
          reader.releaseLock()
        }
        expect(ready.trim()).toBe("locked")

        const result = await runHelper(source, destination, 20, retryScript)
        expect(await locker.exited).toBe(0)

        expect(result.exitCode).toBe(0)
        expect(await readFile(destination, "utf8")).toBe("new")
      } finally {
        if (locker) {
          locker.kill()
          await locker.exited
        }
        await rm(root, { recursive: true, force: true })
      }
    },
    powershellTestTimeout,
  )

  it(
    "keeps a replacement successful when skill refresh fails",
    async () => {
      const root = await mkdtemp(join(tmpdir(), "noodle-update-helper-skill-"))
      const stage = join(root, "stage")
      const source = join(stage, "noodle-windows-x86_64.exe")
      const stagedHelper = join(stage, "complete-update.ps1")
      const destination = join(root, "noodle.exe")
      try {
        await mkdir(stage)
        await writeFile(source, "not a runnable executable")
        await writeFile(stagedHelper, await readFile(helper))
        await writeFile(destination, "old")

        const result = await runHelper(
          source,
          destination,
          1,
          stagedHelper,
          true,
        )

        expect(result.exitCode).toBe(0)
        expect(await readFile(destination, "utf8")).toBe(
          "not a runnable executable",
        )
        expect(await Bun.file(stage).exists()).toBe(false)
      } finally {
        await rm(root, { recursive: true, force: true })
      }
    },
    powershellTestTimeout,
  )
})
