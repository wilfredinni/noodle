import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  getAssetName,
  getPlatformString,
  installBinaryUpdate,
  isBunRuntime,
  runUpdate,
  sha256,
} from "../../src/app/commands/update"

describe("Windows update staging", () => {
  let directory: string
  let executable: string
  const binary = new TextEncoder().encode("verified replacement")

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "noodle-windows-update-"))
    executable = join(directory, "noodle.exe")
    await writeFile(executable, "old")
  })

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it("maps only Windows x64 and recognizes Windows Bun runtimes", () => {
    expect(getPlatformString("win32", "x64")).toBe("windows-x86_64")
    expect(getAssetName("win32", "x64")).toBe("noodle-windows-x86_64.exe")
    expect(() => getPlatformString("win32", "arm64")).toThrow(
      "Unsupported platform: win32-arm64",
    )
    for (const name of ["bun.exe", "BUN.EXE", "bunx.exe", "bun-debug.exe"]) {
      expect(isBunRuntime(`C:\\Users\\example\\.bun\\bin\\${name}`)).toBe(true)
    }
    expect(
      isBunRuntime("C:\\Users\\example\\Programs\\Noodle\\noodle.exe"),
    ).toBe(false)
  })

  it("retains verified staging for the helper and defers existing skill refresh", async () => {
    await mkdir(join(directory, ".agents", "skills", "noodle-use"), {
      recursive: true,
    })
    const started: string[][] = []
    let refreshes = 0
    const environment = { USERPROFILE: directory }
    const result = await installBinaryUpdate(
      "v1.2.3",
      "https://example.com/binary",
      sha256(binary),
      {
        execPath: executable,
        platform: "win32",
        arch: "x64",
        env: environment,
        fetcher: async () => new Response(binary),
        startProcess: async (args, options) => {
          await Promise.resolve()
          expect(options?.env).toBe(environment)
          started.push(args)
        },
        runProcess: async () => {
          refreshes++
          return { exitCode: 0 }
        },
      },
    )
    expect(result).toEqual({
      data: {
        status: "restart_required",
        version: "v1.2.3",
        log_path: join(directory, ".noodle-update.log"),
        skill_status: "pending",
      },
    })
    expect(await readFile(executable, "utf8")).toBe("old")
    expect(refreshes).toBe(0)
    expect(started).toHaveLength(1)
    const args = started[0]!
    expect(args[0]).toBe("powershell.exe")
    expect(args).toContain("-RefreshSkill")
    expect(args).not.toContain("--force")
    expect(args[args.indexOf("-ParentPid") + 1]).toBe(String(process.pid))
    expect(args[args.indexOf("-ExpectedSha256") + 1]).toBe(sha256(binary))
    expect(args[args.indexOf("-Destination") + 1]).toBe(executable)
    const staged = args[args.indexOf("-Source") + 1]!
    expect(staged.endsWith("noodle-windows-x86_64.exe")).toBe(true)
    expect(await readFile(staged)).toEqual(Buffer.from(binary))
    expect(await readFile(args[args.indexOf("-File") + 1]!, "utf8")).toContain(
      "Wait-Process -Id $ParentPid",
    )
  })

  it("does not launch a helper or replace the executable for an invalid checksum", async () => {
    let launches = 0
    const result = await installBinaryUpdate(
      "v1.2.3",
      "https://example.com/binary",
      "0".repeat(64),
      {
        execPath: executable,
        platform: "win32",
        arch: "x64",
        env: {},
        fetcher: async () => new Response(binary),
        startProcess: () => {
          launches++
        },
      },
    )
    expect(result.failed).toBe(true)
    expect(launches).toBe(0)
    expect(await readFile(executable, "utf8")).toBe("old")
    expect(await readdir(directory)).toEqual(["noodle.exe"])
  })

  it("cleans staging when the helper cannot launch", async () => {
    const result = await installBinaryUpdate(
      "v1.2.3",
      "https://example.com/binary",
      sha256(binary),
      {
        execPath: executable,
        platform: "win32",
        arch: "x64",
        env: {},
        fetcher: async () => new Response(binary),
        startProcess: async () => {
          await Promise.resolve()
          throw new Error("PowerShell unavailable")
        },
      },
    )
    expect(result).toEqual({
      data: { status: "update_failed", reason: "PowerShell unavailable" },
      failed: true,
    })
    expect(await readFile(executable, "utf8")).toBe("old")
    expect((await readdir(directory)).sort()).toEqual([
      ".noodle-update.log",
      "noodle.exe",
    ])
    expect(
      await readFile(join(directory, ".noodle-update.log"), "utf8"),
    ).toContain("PowerShell unavailable")
  })

  it("uses the Windows manifest key and exact exe asset in the CLI update action", async () => {
    const urls: string[] = []
    const result = await runUpdate(true, true, {
      execPath: executable,
      platform: "win32",
      arch: "x64",
      env: {},
      cachePath: join(directory, "cache.json"),
      fetcher: async (input) => {
        urls.push(String(input))
        return urls.length === 1
          ? new Response(
              JSON.stringify({
                version: "v99.0.0",
                assets: { "windows-x86_64": { sha256: sha256(binary) } },
              }),
            )
          : new Response(binary)
      },
      startProcess: () => {},
    })
    expect(result.data.status).toBe("restart_required")
    expect(result.failed).toBeUndefined()
    expect(urls[1]).toBe(
      "https://github.com/wilfredinni/noodle/releases/download/v99.0.0/noodle-windows-x86_64.exe",
    )
    expect(await readFile(executable, "utf8")).toBe("old")
  })
})
