import { describe, it, expect } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  getPlatformString,
  compareStableVersions,
  getAssetName,
  isNewerVersion,
  isHomebrewInstall,
  parseChecksumManifest,
  isFreshUpdateCache,
  loadUpdateCache,
  parseUpdateCache,
  runUpdate,
  saveUpdateCache,
  sha256,
  UPDATE_CACHE_TTL_MS,
} from "../../src/app/commands/update"

describe("getPlatformString", () => {
  it("returns macos-arm64 for darwin + arm64", () => {
    expect(getPlatformString("darwin", "arm64")).toBe("macos-arm64")
  })

  it("returns macos-x86_64 for darwin + x64", () => {
    expect(getPlatformString("darwin", "x64")).toBe("macos-x86_64")
  })

  it("returns linux-x86_64 for linux + x64", () => {
    expect(getPlatformString("linux", "x64")).toBe("linux-x86_64")
  })

  it("rejects unsupported 32-bit architectures", () => {
    expect(() => getPlatformString("linux", "ia32")).toThrow(
      "Unsupported platform",
    )
  })

  it("returns linux-arm64 for linux + arm64", () => {
    expect(getPlatformString("linux", "arm64")).toBe("linux-arm64")
  })

  it("rejects unsupported architectures", () => {
    expect(() => getPlatformString("linux", "mips")).toThrow(
      "Unsupported platform",
    )
  })

  it("rejects unsupported operating systems", () => {
    expect(() => getPlatformString("freebsd", "x64")).toThrow(
      "Unsupported platform",
    )
  })
})

describe("getAssetName", () => {
  it("includes the platform string", () => {
    expect(getAssetName("darwin", "arm64")).toBe("noodle-macos-arm64")
    expect(getAssetName("linux", "x64")).toBe("noodle-linux-x86_64")
  })
})

describe("isNewerVersion", () => {
  it("returns false when versions match", () => {
    expect(isNewerVersion("v0.1.0", "v0.1.0")).toBe(false)
  })

  it("returns true only when latest is newer", () => {
    expect(isNewerVersion("v0.1.0", "v0.2.0")).toBe(true)
    expect(isNewerVersion("v0.1.0", "v1.0.0")).toBe(true)
    expect(isNewerVersion("v0.1.0", "v0.0.9")).toBe(false)
    expect(isNewerVersion("v0.1.0", "v0.1.0-beta.1")).toBe(false)
    expect(isNewerVersion("v0.1.0", "release")).toBe(false)
  })
})

describe("compareStableVersions", () => {
  it("returns ordering for v-prefixed stable versions", () => {
    expect(compareStableVersions("v0.4.6", "v0.4.7")).toBe(1)
    expect(compareStableVersions("v0.4.7", "v0.4.6")).toBe(-1)
    expect(compareStableVersions("v0.4.6", "v0.4.6")).toBe(0)
  })

  it("returns null for malformed or prerelease tags", () => {
    expect(compareStableVersions("v0.4.6", "0.4.7")).toBeNull()
    expect(compareStableVersions("v0.4.6", "v0.4.7-beta.1")).toBeNull()
  })
})

describe("checksum helpers", () => {
  it("finds the exact asset checksum", () => {
    expect(
      parseChecksumManifest(
        "a".repeat(64) +
          "  noodle-linux-arm64\n" +
          "b".repeat(64) +
          "  noodle-linux-x86_64\n",
        "noodle-linux-x86_64",
      ),
    ).toBe("b".repeat(64))
  })

  it("rejects missing and malformed checksums", () => {
    expect(
      parseChecksumManifest(
        "not-a-checksum  noodle-linux-arm64",
        "noodle-linux-arm64",
      ),
    ).toBeNull()
    expect(
      parseChecksumManifest("a".repeat(64) + "  other", "noodle-linux-arm64"),
    ).toBeNull()
  })

  it("calculates SHA-256", () => {
    expect(sha256(new TextEncoder().encode("noodle"))).toBe(
      "49742b4b8dd3a7ff2a2a32410e34f55a57d09a2327edb26d726a30e400960966",
    )
  })
})

describe("update cache", () => {
  it("validates and expires cache entries", () => {
    const cache = parseUpdateCache({ latestTag: "v0.4.6", checkedAt: 1000 })
    expect(cache).toEqual({ latestTag: "v0.4.6", checkedAt: 1000 })
    expect(UPDATE_CACHE_TTL_MS).toBe(60 * 60 * 1000)
    expect(isFreshUpdateCache(cache!, 1000 + UPDATE_CACHE_TTL_MS)).toBe(true)
    expect(isFreshUpdateCache(cache!, 1001 + UPDATE_CACHE_TTL_MS)).toBe(false)
    expect(
      parseUpdateCache({ latestTag: "v0.4.6-beta.1", checkedAt: 1000 }),
    ).toBeNull()
    expect(parseUpdateCache({ latestTag: "v0.4.6", checkedAt: -1 })).toBeNull()
  })

  it("saves and loads cache atomically", async () => {
    const dir = await mkdtemp(join(tmpdir(), "noodle-update-cache-"))
    const path = join(dir, "nested", "update-cache.json")
    try {
      await saveUpdateCache(path, { latestTag: "v0.4.6", checkedAt: 42 })
      expect(await loadUpdateCache(path)).toEqual({
        latestTag: "v0.4.6",
        checkedAt: 42,
      })
      expect(JSON.parse(await readFile(path, "utf8"))).toEqual({
        latestTag: "v0.4.6",
        checkedAt: 42,
      })
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("uses a fresh matching cache without calling GitHub", async () => {
    const dir = await mkdtemp(join(tmpdir(), "noodle-update-cache-"))
    const path = join(dir, "update-cache.json")
    let calls = 0
    try {
      await writeFile(
        path,
        JSON.stringify({ latestTag: "v0.4.8", checkedAt: 1000 }),
      )
      const result = await runUpdate(true, false, {
        cachePath: path,
        now: () => 1000,
        execPath: "/tmp/noodle",
        platform: "darwin",
        arch: "arm64",
        env: {},
        fetcher: async () => {
          calls += 1
          return new Response()
        },
      })
      expect(result.data).toEqual({
        status: "up_to_date",
        version: "v0.4.8",
        cached: "true",
      })
      expect(calls).toBe(0)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("uses a fresh newer cached release without checking GitHub again", async () => {
    const dir = await mkdtemp(join(tmpdir(), "noodle-update-cache-"))
    const path = join(dir, "update-cache.json")
    const executable = join(dir, "noodle")
    const binary = new TextEncoder().encode("new")
    let githubCalls = 0
    try {
      await writeFile(
        path,
        JSON.stringify({ latestTag: "v0.4.9", checkedAt: 1000 }),
      )
      await writeFile(executable, "old")
      const result = await runUpdate(true, false, {
        cachePath: path,
        now: () => 1000,
        execPath: executable,
        platform: "darwin",
        arch: "arm64",
        env: {},
        fetcher: async (input) => {
          const url = String(input)
          if (url.includes("api.github.com")) {
            githubCalls += 1
            return new Response(null, { status: 500 })
          }
          if (url.endsWith("noodle-macos-arm64")) return new Response(binary)
          return new Response(`${sha256(binary)}  noodle-macos-arm64\n`)
        },
      })
      expect(result.data).toEqual({ status: "updated", version: "v0.4.9" })
      expect(githubCalls).toBe(0)
      expect(await readFile(executable, "utf8")).toBe("new")
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe("update release discovery", () => {
  const baseDeps = (cachePath: string) => ({
    cachePath,
    now: () => 1000,
    execPath: "/tmp/noodle",
    platform: "darwin",
    arch: "arm64",
  })

  it("bypasses cache with --force and sends GH_TOKEN first", async () => {
    const dir = await mkdtemp(join(tmpdir(), "noodle-update-force-"))
    const path = join(dir, "update-cache.json")
    let request: RequestInit | undefined
    try {
      const result = await runUpdate(true, true, {
        ...baseDeps(path),
        env: { GH_TOKEN: "gh-token", GITHUB_TOKEN: "github-token" },
        fetcher: async (_url, init) => {
          request = init
          return Response.json({ tag_name: "v0.4.6", assets: [] })
        },
      })
      expect(result.data.status).toBe("up_to_date")
      expect((request?.headers as Record<string, string>).Authorization).toBe(
        "Bearer gh-token",
      )
      expect(await loadUpdateCache(path)).toEqual({
        latestTag: "v0.4.6",
        checkedAt: 1000,
      })
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("uses GITHUB_TOKEN when GH_TOKEN is absent", async () => {
    const dir = await mkdtemp(join(tmpdir(), "noodle-update-auth-"))
    let request: RequestInit | undefined
    try {
      await runUpdate(true, true, {
        ...baseDeps(join(dir, "cache.json")),
        env: { GITHUB_TOKEN: "github-token" },
        fetcher: async (_url, init) => {
          request = init
          return Response.json({ tag_name: "v0.4.6", assets: [] })
        },
      })
      expect((request?.headers as Record<string, string>).Authorization).toBe(
        "Bearer github-token",
      )
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("reports rate limits and reset time", async () => {
    const dir = await mkdtemp(join(tmpdir(), "noodle-update-rate-"))
    try {
      const result = await runUpdate(true, true, {
        ...baseDeps(join(dir, "cache.json")),
        env: {},
        fetcher: async () =>
          new Response(null, {
            status: 403,
            headers: {
              "x-ratelimit-remaining": "0",
              "x-ratelimit-reset": "2000",
            },
          }),
      })
      expect(result).toEqual({
        data: {
          status: "rate_limited",
          retry_at: "1970-01-01T00:33:20.000Z",
        },
        failed: true,
      })
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("treats 429 as rate limited and ordinary 403 as a check failure", async () => {
    const dir = await mkdtemp(join(tmpdir(), "noodle-update-rate-"))
    try {
      const deps = baseDeps(join(dir, "cache.json"))
      const rateLimited = await runUpdate(true, true, {
        ...deps,
        env: {},
        fetcher: async () => new Response(null, { status: 429 }),
      })
      const forbidden = await runUpdate(true, true, {
        ...deps,
        env: {},
        fetcher: async () =>
          new Response(null, {
            status: 403,
            headers: { "x-ratelimit-remaining": "10" },
          }),
      })
      expect(rateLimited.data.status).toBe("rate_limited")
      expect(forbidden.data.status).toBe("check_failed")
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("does not send an authorization header without a token", async () => {
    const dir = await mkdtemp(join(tmpdir(), "noodle-update-auth-"))
    let request: RequestInit | undefined
    try {
      await runUpdate(true, true, {
        ...baseDeps(join(dir, "cache.json")),
        env: {},
        fetcher: async (_url, init) => {
          request = init
          return Response.json({ tag_name: "v0.4.6", assets: [] })
        },
      })
      expect(request?.headers).toEqual({
        Accept: "application/vnd.github+json",
      })
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("replaces the binary after a verified download", async () => {
    const dir = await mkdtemp(join(tmpdir(), "noodle-update-success-"))
    const executable = join(dir, "noodle")
    const binary = new TextEncoder().encode("new")
    try {
      await writeFile(executable, "old")
      const result = await runUpdate(true, true, {
        ...baseDeps(join(dir, "cache.json")),
        execPath: executable,
        env: {},
        fetcher: async (input) => {
          const url = String(input)
          if (url.includes("api.github.com"))
            return Response.json({
              tag_name: "v0.4.9",
              assets: [
                { name: "noodle-macos-arm64", browser_download_url: "binary" },
              ],
            })
          if (url === "binary") return new Response(binary)
          return new Response(`${sha256(binary)}  noodle-macos-arm64\n`)
        },
      })
      expect(result.data).toEqual({ status: "updated", version: "v0.4.9" })
      expect(await readFile(executable, "utf8")).toBe("new")
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("does not replace the binary when checksum verification fails", async () => {
    const dir = await mkdtemp(join(tmpdir(), "noodle-update-checksum-"))
    const executable = join(dir, "noodle")
    try {
      await writeFile(executable, "old")
      const result = await runUpdate(true, true, {
        ...baseDeps(join(dir, "cache.json")),
        execPath: executable,
        env: {},
        fetcher: async (input) => {
          const url = String(input)
          if (url.includes("api.github.com"))
            return Response.json({
              tag_name: "v0.4.9",
              assets: [
                { name: "noodle-macos-arm64", browser_download_url: "binary" },
              ],
            })
          if (url === "binary") return new Response("new")
          return new Response("0".repeat(64) + "  noodle-macos-arm64\n")
        },
      })
      expect(result.data.status).toBe("update_failed")
      expect(await readFile(executable, "utf8")).toBe("old")
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe("Homebrew updates", () => {
  const brewDeps = (
    runProcess: (
      args: string[],
      captureOutput: boolean,
    ) => Promise<{ exitCode: number }>,
  ) => ({
    cachePath: "/tmp/noodle-homebrew-cache.json",
    now: () => 1000,
    execPath: "/opt/homebrew/bin/noodle",
    platform: "darwin",
    arch: "arm64",
    env: {},
    runProcess,
  })

  it("runs brew upgrade noodle and captures output in JSON mode", async () => {
    let receivedArgs: string[] | undefined
    let captured: boolean | undefined
    let fetchCalled = false
    const result = await runUpdate(true, false, {
      ...brewDeps(async (args, captureOutput) => {
        receivedArgs = args
        captured = captureOutput
        return { exitCode: 0 }
      }),
      fetcher: async () => {
        fetchCalled = true
        return new Response()
      },
    })
    expect(result).toEqual({
      data: { status: "homebrew_updated", command: "brew upgrade noodle" },
    })
    expect(receivedArgs).toEqual(["brew", "upgrade", "noodle"])
    expect(captured).toBe(true)
    expect(fetchCalled).toBe(false)
  })

  it("lets human mode stream Brew output", async () => {
    let captured: boolean | undefined
    const result = await runUpdate(false, false, {
      ...brewDeps(async (_args, captureOutput) => {
        captured = captureOutput
        return { exitCode: 0 }
      }),
    })
    expect(result.data.status).toBe("homebrew_updated")
    expect(captured).toBe(false)
  })

  it("reports Brew failures and unavailable Brew", async () => {
    const failed = await runUpdate(true, false, {
      ...brewDeps(async () => ({ exitCode: 1 })),
    })
    const unavailable = await runUpdate(true, false, {
      ...brewDeps(async () => {
        throw new Error("spawn failed")
      }),
    })
    expect(failed).toEqual({
      data: {
        status: "homebrew_failed",
        command: "brew upgrade noodle",
        exit_code: "1",
      },
      failed: true,
    })
    expect(unavailable).toEqual({
      data: { status: "homebrew_failed", command: "brew upgrade noodle" },
      failed: true,
    })
  })
})

describe("isHomebrewInstall", () => {
  it("detects homebrew prefix", () => {
    expect(isHomebrewInstall("/opt/homebrew/bin/noodle")).toBe(true)
  })

  it("detects linuxbrew prefix", () => {
    expect(isHomebrewInstall("/home/linuxbrew/.linuxbrew/bin/noodle")).toBe(
      true,
    )
  })

  it("detects user-local linuxbrew prefix", () => {
    expect(isHomebrewInstall("/home/user/.linuxbrew/bin/noodle")).toBe(true)
  })

  it("detects brew in path", () => {
    expect(isHomebrewInstall("/usr/local/brew/bin/noodle")).toBe(true)
  })

  it("returns false for non-brew paths", () => {
    expect(isHomebrewInstall("/home/user/.local/bin/noodle")).toBe(false)
    expect(isHomebrewInstall("/usr/local/bin/noodle")).toBe(false)
    expect(isHomebrewInstall("/tmp/noodle")).toBe(false)
  })
})
