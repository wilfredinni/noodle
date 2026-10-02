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
  copyFile,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { getUpdateDeps, sha256 } from "../../src/app/commands/update"
import {
  compileWindowsFixture,
  waitForFile,
  windowsPowerShell,
} from "../windowsTestHelpers"

const helper = join(
  import.meta.dir,
  "../../scripts/complete-windows-update.ps1",
)

describe.skipIf(process.platform !== "win32")(
  "Windows executable update lifecycle",
  () => {
    let fixtures: string
    let parentFixture: string
    let replacement: string
    let directory: string
    let source: string
    let destination: string
    let log: string
    let hash: string

    beforeAll(async () => {
      fixtures = await mkdtemp(join(tmpdir(), "noodle-update-fixtures-"))
      parentFixture = join(fixtures, "parent.exe")
      replacement = join(fixtures, "replacement.exe")
      await compileWindowsFixture("windowsUpdateParent", parentFixture)
      await compileWindowsFixture("windowsUpdateReplacement", replacement)
      hash = sha256(await readFile(replacement))
    }, 120_000)
    afterAll(async () => {
      await rm(fixtures, { recursive: true, force: true })
    })
    beforeEach(async () => {
      directory = await realpath(
        await mkdtemp(join(tmpdir(), "noodle update café & 100% O'Brien-")),
      )
      const stage = join(directory, "stage")
      await mkdir(stage)
      source = join(stage, "noodle-windows-x86_64.exe")
      destination = join(directory, "noodle.exe")
      log = join(directory, ".noodle-update.log")
      await copyFile(replacement, source)
      await copyFile(parentFixture, destination)
    })
    afterEach(async () => {
      await rm(directory, {
        recursive: true,
        force: true,
        maxRetries: 10,
        retryDelay: 100,
      })
    })

    function startHelper(
      environment: Record<string, string | undefined> = process.env,
      refresh = false,
      attempts = 1,
    ) {
      const args = [
        windowsPowerShell,
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        helper,
        "-ParentPid",
        "2147483647",
        "-Source",
        source,
        "-Destination",
        destination,
        "-Version",
        "v1.2.3",
        "-ExpectedSha256",
        hash,
        "-LogPath",
        log,
        "-MaxAttempts",
        String(attempts),
      ]
      if (refresh) args.push("-RefreshSkill")
      return Bun.spawn(args, {
        env: environment,
        stdout: "pipe",
        stderr: "pipe",
      })
    }

    async function expectHelperExit(
      child: ReturnType<typeof startHelper>,
      expected: number,
    ) {
      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ])
      const messages = await readFile(log, "utf8").catch(() => "")
      expect(exitCode, `${stdout}\n${stderr}\n${messages}`).toBe(expected)
    }

    async function waitForCompletedUpdate(stderr: string) {
      try {
        await waitForFile(log, (value) => value.includes("Update complete."))
      } catch (error) {
        const files = await readdir(directory)
        const stages = await Promise.all(
          files
            .filter((name) => name.startsWith(".noodle-update-"))
            .map(
              async (name) =>
                `${name}: ${(await readdir(join(directory, name))).join(", ")}`,
            ),
        )
        throw new Error(
          `${error instanceof Error ? error.message : error}\nParent stderr:\n${stderr}\nFiles: ${files.join(", ")}\n${stages.join("\n")}`,
          { cause: error },
        )
      }
    }

    it("launches a hidden helper with literal arguments and its environment", async () => {
      const script = join(directory, "launch probe.ps1")
      const legacyMarker = join(directory, "legacy.txt")
      const marker = join(directory, "hidden.txt")
      const value = "literal & 100% O'Brien café"
      await writeFile(
        script,
        'param([string]$Target, [string]$Value)\n[IO.File]::WriteAllText($Target, "$Value`n$env:NOODLE_TEST_LAUNCH_VALUE")\n',
      )
      const argumentsFor = (target: string) => [
        windowsPowerShell,
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        script,
        "-Target",
        target,
        "-Value",
        value,
      ]
      const probe = Bun.spawnSync(argumentsFor(legacyMarker), {
        detached: true,
        stdin: "ignore",
        stdout: "ignore",
        stderr: "ignore",
        windowsHide: true,
        timeout: 5000,
      })
      console.log(
        `Windows PowerShell detached probe: exit ${probe.exitCode}, script executed ${await Bun.file(legacyMarker).exists()}`,
      )
      await getUpdateDeps({}).startProcess(argumentsFor(marker), {
        env: { ...process.env, NOODLE_TEST_LAUNCH_VALUE: value },
      })
      expect(await waitForFile(marker)).toBe(`${value}\n${value}`)
    }, 30_000)

    it("waits for the compiled parent, survives its exit, and emits one JSON envelope", async () => {
      const home = join(directory, "home")
      const marker = join(directory, "skill-refresh.json")
      await mkdir(join(home, ".agents", "skills", "noodle-use"), {
        recursive: true,
      })
      const oldHash = sha256(await readFile(destination))
      const parent = Bun.spawn([destination], {
        cwd: directory,
        env: {
          ...process.env,
          HOME: home,
          USERPROFILE: home,
          NOODLE_TEST_UPDATE_SOURCE: replacement,
          NOODLE_TEST_CACHE: join(directory, "cache.json"),
          NOODLE_TEST_HOLD_PARENT: "1",
          NOODLE_TEST_SKILL_MARKER: marker,
        },
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
      })
      try {
        const reader = parent.stdout.getReader()
        const decoder = new TextDecoder()
        let stdout = ""
        while (!stdout.includes("\n")) {
          const part = await reader.read()
          if (part.done)
            throw new Error("Parent exited without a JSON envelope")
          stdout += decoder.decode(part.value, { stream: true })
        }
        const envelope = JSON.parse(stdout.trim())
        expect(envelope.status).toBe("success")
        expect(envelope.data).toEqual({
          status: "restart_required",
          version: "v1.2.3",
          log_path: log,
          skill_status: "pending",
        })
        expect(sha256(await readFile(destination))).toBe(oldHash)
        parent.stdin.end()
        expect(await parent.exited).toBe(0)
        for (;;) {
          const part = await reader.read()
          if (part.done) break
          stdout += decoder.decode(part.value, { stream: true })
        }
        const stderr = await new Response(parent.stderr).text()
        await waitForCompletedUpdate(stderr)
        expect(stdout.trim().split(/\r?\n/)).toHaveLength(1)
        expect(stderr).toBe("")
        expect(sha256(await readFile(destination))).toBe(hash)
        expect(
          Bun.spawnSync([destination, "--version"]).stdout.toString().trim(),
        ).toBe("1.2.3")
        expect(JSON.parse(await readFile(marker, "utf8"))).toEqual({
          executable: destination,
          args: ["agent", "install", "--json"],
        })
      } finally {
        if (parent.exitCode === null) {
          parent.kill()
          await parent.exited
        }
      }
    }, 60_000)

    it("completes the update when the compiled CLI exits immediately after staging", async () => {
      const parent = Bun.spawn([destination], {
        cwd: directory,
        env: {
          ...process.env,
          NOODLE_TEST_UPDATE_SOURCE: replacement,
          NOODLE_TEST_CACHE: join(directory, "cache.json"),
        },
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
      })
      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(parent.stdout).text(),
        new Response(parent.stderr).text(),
        parent.exited,
      ])
      expect(exitCode, `${stdout}\n${stderr}`).toBe(0)
      expect(stdout.trim().split(/\r?\n/)).toHaveLength(1)
      expect(JSON.parse(stdout.trim()).data.status).toBe("restart_required")
      await waitForCompletedUpdate(stderr)
      expect(sha256(await readFile(destination))).toBe(hash)
    }, 60_000)

    it("rechecks the staged checksum after parent exit", async () => {
      const oldHash = sha256(await readFile(destination))
      await writeFile(source, "tampered")
      const child = startHelper()
      await expectHelperExit(child, 1)
      expect(sha256(await readFile(destination))).toBe(oldHash)
      expect(await readFile(source, "utf8")).toBe("tampered")
      expect(await readFile(log, "utf8")).toContain("checksum mismatch")
    })

    it("rolls back a wrong installed version and retains the rejected executable", async () => {
      const oldHash = sha256(await readFile(destination))
      const child = startHelper({
        ...process.env,
        NOODLE_TEST_REPLACEMENT_VERSION: "9.9.9",
      })
      await expectHelperExit(child, 1)
      expect(sha256(await readFile(destination))).toBe(oldHash)
      expect(sha256(await readFile(source))).toBe(hash)
      expect(await readFile(log, "utf8")).toContain("expected version")
      expect(await readFile(log, "utf8")).toContain("Recovery files")
    })

    it("retries a locked executable and preserves it when retries are exhausted", async () => {
      const oldHash = sha256(await readFile(destination))
      const ready = join(directory, "locked")
      const script = join(directory, "lock.ps1")
      await writeFile(
        script,
        'param([string]$Target, [string]$Ready)\n$stream = [IO.File]::Open($Target, "Open", "Read", "Read")\n[IO.File]::WriteAllText($Ready, "locked")\n[Console]::ReadLine() | Out-Null\n$stream.Dispose()\n',
      )
      const locker = Bun.spawn(
        [
          windowsPowerShell,
          "-NoProfile",
          "-File",
          script,
          "-Target",
          destination,
          "-Ready",
          ready,
        ],
        { stdin: "pipe", stdout: "pipe", stderr: "pipe" },
      )
      try {
        await waitForFile(ready)
        const failed = startHelper()
        await expectHelperExit(failed, 1)
        expect(sha256(await readFile(destination))).toBe(oldHash)
        expect(sha256(await readFile(source))).toBe(hash)
        await writeFile(log, "")
        const retry = startHelper(process.env, false, 100)
        await waitForFile(log, (value) => value.includes("Applying update"))
        locker.stdin.write("release\n")
        locker.stdin.end()
        expect(await locker.exited).toBe(0)
        await expectHelperExit(retry, 0)
        expect(sha256(await readFile(destination))).toBe(hash)
        expect(await Bun.file(source).exists()).toBe(false)
      } finally {
        if (locker.exitCode === null) {
          locker.kill()
          await locker.exited
        }
      }
    }, 60_000)

    it("keeps an update successful when the replacement cannot refresh an existing skill", async () => {
      const marker = join(directory, "skill-refresh.json")
      const child = startHelper(
        {
          ...process.env,
          NOODLE_TEST_SKILL_FAIL: "1",
          NOODLE_TEST_SKILL_MARKER: marker,
        },
        true,
      )
      await expectHelperExit(child, 0)
      expect(sha256(await readFile(destination))).toBe(hash)
      expect(JSON.parse(await readFile(marker, "utf8")).args).toEqual([
        "agent",
        "install",
        "--json",
      ])
      expect(await readFile(log, "utf8")).toContain(
        "Retry with: noodle agent install",
      )
      expect(await Bun.file(source).exists()).toBe(false)
    })
  },
)
