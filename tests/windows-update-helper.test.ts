import { describe, expect, it } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

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
    "powershell.exe",
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
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
  return Bun.spawnSync(args)
}

describeWindows("Windows update helper", () => {
  it("replaces the executable and removes successful staging", async () => {
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

      const result = runHelper(source, destination, 1, stagedHelper)

      expect(result.exitCode).toBe(0)
      expect(await readFile(destination, "utf8")).toBe("new")
      expect(await Bun.file(stage).exists()).toBe(false)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it("preserves staging when replacement fails", async () => {
    const root = await mkdtemp(join(tmpdir(), "noodle-update-helper-fail-"))
    const stage = join(root, "stage")
    const source = join(stage, "noodle-windows-x86_64.exe")
    const stagedHelper = join(stage, "complete-update.ps1")
    try {
      await mkdir(stage)
      await Bun.write(source, "new")
      await writeFile(stagedHelper, await readFile(helper))
      const result = runHelper(
        source,
        join(root, "missing", "noodle.exe"),
        1,
        stagedHelper,
      )

      expect(result.exitCode).not.toBe(0)
      expect(await readFile(source, "utf8")).toBe("new")
      expect(await Bun.file(stagedHelper).exists()).toBe(true)
      expect(result.stderr.toString()).toContain("verified binary remains")
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it("retries a temporarily locked executable", async () => {
    const root = await mkdtemp(join(tmpdir(), "noodle-update-helper-retry-"))
    const stage = join(root, "stage")
    const source = join(stage, "noodle-windows-x86_64.exe")
    const destination = join(root, "noodle.exe")
    const ready = join(root, "locked")
    const lockerScript = join(root, "lock.ps1")
    try {
      await mkdir(stage)
      await writeFile(source, "new")
      await writeFile(destination, "old")
      await writeFile(
        lockerScript,
        `param([string]$Target, [string]$Ready)
$stream = [IO.File]::Open($Target, "Open", "ReadWrite", "None")
New-Item -ItemType File -Path $Ready | Out-Null
Start-Sleep -Milliseconds 350
$stream.Dispose()
`,
      )
      const locker = Bun.spawn([
        "powershell.exe",
        "-NoProfile",
        "-File",
        lockerScript,
        "-Target",
        destination,
        "-Ready",
        ready,
      ])
      for (let attempt = 0; attempt < 100; attempt += 1) {
        if (await Bun.file(ready).exists()) break
        await Bun.sleep(10)
      }
      expect(await Bun.file(ready).exists()).toBe(true)

      const result = runHelper(source, destination, 20)
      await locker.exited

      expect(result.exitCode).toBe(0)
      expect(await readFile(destination, "utf8")).toBe("new")
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it("keeps a replacement successful when skill refresh fails", async () => {
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

      const result = runHelper(source, destination, 1, stagedHelper, true)

      expect(result.exitCode).toBe(0)
      expect(await readFile(destination, "utf8")).toBe(
        "not a runnable executable",
      )
      expect(await Bun.file(stage).exists()).toBe(false)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
