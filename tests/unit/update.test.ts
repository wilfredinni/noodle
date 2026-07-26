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
  checkForUpdates,
  installBinaryUpdate,
  installBrewUpdate,
  parseManifest,
} from "../../src/app/commands/update"

function makeManifest(tag: string, checksums: Record<string, string>): string {
  const assets: Record<string, { sha256: string }> = {}
  for (const [platform, hash] of Object.entries(checksums)) {
    assets[platform] = { sha256: hash }
  }
  return JSON.stringify({
    version: tag,
    releaseUrl: `https://github.com/wilfredinni/noodle/releases/tag/${tag}`,
    assets,
  })
}

function makeCache(
  tag: string,
  checkedAt: number,
  checksums: Record<string, string>,
) {
  return JSON.stringify({ latestTag: tag, checkedAt, checksums })
}

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

describe("parseManifest", () => {
  const MANIFEST = (version: string) =>
    JSON.stringify({
      version,
      releaseUrl: `https://github.com/wilfredinni/noodle/releases/tag/${version}`,
      assets: {
        "macos-arm64": { sha256: "a".repeat(64) },
        "linux-x86_64": { sha256: "b".repeat(64) },
        "linux-arm64": { sha256: "c".repeat(64) },
      },
    })

  it("parses a valid manifest", () => {
    const m = parseManifest(MANIFEST("v0.5.3"))
    expect(m.version).toBe("v0.5.3")
    expect(m.assets["macos-arm64"].sha256).toBe("a".repeat(64))
    expect(m.assets["linux-x86_64"].sha256).toBe("b".repeat(64))
    expect(m.assets["linux-arm64"].sha256).toBe("c".repeat(64))
  })

  it("normalises SHAs to lowercase", () => {
    const m = parseManifest(
      JSON.stringify({
        version: "v0.5.3",
        assets: { "macos-arm64": { sha256: "A".repeat(64) } },
      }),
    )
    expect(m.assets["macos-arm64"].sha256).toBe("a".repeat(64))
  })

  it("rejects invalid JSON", () => {
    expect(() => parseManifest("not json")).toThrow("Invalid JSON")
  })

  it("rejects non-object manifest", () => {
    expect(() => parseManifest("null")).toThrow("JSON object")
  })

  it("rejects missing version", () => {
    expect(() => parseManifest("{}")).toThrow("missing version")
  })

  it("rejects invalid version", () => {
    expect(() =>
      parseManifest(JSON.stringify({ version: "not-semver", assets: {} })),
    ).toThrow("Invalid version")
  })

  it("rejects missing assets", () => {
    expect(() => parseManifest(JSON.stringify({ version: "v0.5.3" }))).toThrow(
      "missing assets",
    )
  })

  it("rejects invalid sha256 in assets", () => {
    expect(() =>
      parseManifest(
        JSON.stringify({
          version: "v0.5.3",
          assets: { "macos-arm64": { sha256: "not-hex" } },
        }),
      ),
    ).toThrow("Invalid asset entry")
    expect(() =>
      parseManifest(
        JSON.stringify({
          version: "v0.5.3",
          assets: { "macos-arm64": { sha256: "g".repeat(64) } },
        }),
      ),
    ).toThrow("Invalid asset entry")
  })

  it("rejects missing sha256 field", () => {
    expect(() =>
      parseManifest(
        JSON.stringify({
          version: "v0.5.3",
          assets: { "macos-arm64": {} },
        }),
      ),
    ).toThrow("Invalid asset entry")
  })
})

describe("update cache", () => {
  const checksums = { "macos-arm64": "a".repeat(64) }

  it("validates and expires cache entries", () => {
    const cache = parseUpdateCache({
      latestTag: "v0.4.6",
      checkedAt: 1000,
      checksums,
    })
    expect(cache).toEqual({
      latestTag: "v0.4.6",
      checkedAt: 1000,
      checksums,
    })
    expect(UPDATE_CACHE_TTL_MS).toBe(60 * 60 * 1000)
    expect(isFreshUpdateCache(cache!, 1000 + UPDATE_CACHE_TTL_MS)).toBe(true)
    expect(isFreshUpdateCache(cache!, 1001 + UPDATE_CACHE_TTL_MS)).toBe(false)
    expect(
      parseUpdateCache({
        latestTag: "v0.4.6-beta.1",
        checkedAt: 1000,
        checksums,
      }),
    ).toBeNull()
    expect(
      parseUpdateCache({ latestTag: "v0.4.6", checkedAt: -1, checksums }),
    ).toBeNull()
  })

  it("rejects cache without checksums", () => {
    expect(
      parseUpdateCache({ latestTag: "v0.4.6", checkedAt: 1000 }),
    ).toBeNull()
  })

  it("rejects cache with malformed checksums", () => {
    expect(
      parseUpdateCache({
        latestTag: "v0.4.6",
        checkedAt: 1000,
        checksums: { "macos-arm64": "not-hex" },
      }),
    ).toBeNull()
    expect(
      parseUpdateCache({
        latestTag: "v0.4.6",
        checkedAt: 1000,
        checksums: {},
      }),
    ).toBeNull()
  })

  it("saves and loads cache atomically", async () => {
    const dir = await mkdtemp(join(tmpdir(), "noodle-update-cache-"))
    const path = join(dir, "nested", "update-cache.json")
    try {
      await saveUpdateCache(path, {
        latestTag: "v0.4.6",
        checkedAt: 42,
        checksums,
      })
      expect(await loadUpdateCache(path)).toEqual({
        latestTag: "v0.4.6",
        checkedAt: 42,
        checksums,
      })
      expect(JSON.parse(await readFile(path, "utf8"))).toEqual({
        latestTag: "v0.4.6",
        checkedAt: 42,
        checksums,
      })
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("uses a fresh matching cache without calling network", async () => {
    const dir = await mkdtemp(join(tmpdir(), "noodle-update-cache-"))
    const path = join(dir, "update-cache.json")
    let calls = 0
    try {
      await writeFile(path, makeCache("v0.5.2", 1000, checksums))
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
        version: "v0.5.2",
        cached: "true",
      })
      expect(calls).toBe(0)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("uses a fresh newer cached release without checking network again", async () => {
    const dir = await mkdtemp(join(tmpdir(), "noodle-update-cache-"))
    const path = join(dir, "update-cache.json")
    const executable = join(dir, "noodle")
    const binary = new TextEncoder().encode("new")
    const binaryHash = sha256(binary)
    let manifestCalls = 0
    try {
      await writeFile(
        path,
        makeCache("v0.5.3", 1000, { "macos-arm64": binaryHash }),
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
          if (url.endsWith("update.json")) {
            manifestCalls += 1
            return new Response(null, { status: 500 })
          }
          if (url.endsWith("noodle-macos-arm64")) return new Response(binary)
          return new Response()
        },
      })
      expect(result.data).toEqual({ status: "updated", version: "v0.5.3" })
      expect(manifestCalls).toBe(0)
      expect(await readFile(executable, "utf8")).toBe("new")
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("falls back to manifest fetch when cache has newer tag but no checksum for platform", async () => {
    const dir = await mkdtemp(join(tmpdir(), "noodle-update-cache-"))
    const path = join(dir, "update-cache.json")
    const executable = join(dir, "noodle")
    const binary = new TextEncoder().encode("new")
    const binaryHash = sha256(binary)
    let manifestCalls = 0
    try {
      await writeFile(
        path,
        makeCache("v0.5.3", 1000, { "linux-x86_64": binaryHash }),
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
          if (url.endsWith("update.json")) {
            manifestCalls += 1
            return new Response(
              makeManifest("v0.5.3", { "macos-arm64": binaryHash }),
              { status: 200 },
            )
          }
          if (url.endsWith("noodle-macos-arm64")) return new Response(binary)
          return new Response()
        },
      })
      expect(result.data).toEqual({ status: "updated", version: "v0.5.3" })
      expect(manifestCalls).toBe(1)
      expect(await readFile(executable, "utf8")).toBe("new")
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe("update release discovery via manifest", () => {
  const baseDeps = (cachePath: string) => ({
    cachePath,
    now: () => 1000,
    execPath: "/tmp/noodle",
    platform: "darwin",
    arch: "arm64",
  })

  const binaryHash = "a".repeat(64)

  it("discovers version and sha256 from update manifest", async () => {
    const dir = await mkdtemp(join(tmpdir(), "noodle-manifest-"))
    const binary = new TextEncoder().encode("new")
    const executable = join(dir, "noodle")
    try {
      await writeFile(executable, "old")
      const result = await runUpdate(true, true, {
        ...baseDeps(join(dir, "cache.json")),
        execPath: executable,
        env: {},
        fetcher: async (input) => {
          const url = String(input)
          if (url.endsWith("update.json"))
            return new Response(
              makeManifest("v99.0.0", { "macos-arm64": sha256(binary) }),
              { status: 200 },
            )
          if (url.endsWith("noodle-macos-arm64")) return new Response(binary)
          return new Response()
        },
      })
      expect(result.data).toEqual({ status: "updated", version: "v99.0.0" })
      expect(await readFile(executable, "utf8")).toBe("new")
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("rejects binary when checksum mismatches manifest", async () => {
    const dir = await mkdtemp(join(tmpdir(), "noodle-manifest-checksum-"))
    const executable = join(dir, "noodle")
    try {
      await writeFile(executable, "old")
      const result = await runUpdate(true, true, {
        ...baseDeps(join(dir, "cache.json")),
        execPath: executable,
        env: {},
        fetcher: async (input) => {
          const url = String(input)
          if (url.endsWith("update.json"))
            return new Response(
              makeManifest("v99.0.0", { "macos-arm64": binaryHash }),
              { status: 200 },
            )
          if (url.endsWith("noodle-macos-arm64")) return new Response("new")
          return new Response()
        },
      })
      expect(result.data.status).toBe("update_failed")
      expect(await readFile(executable, "utf8")).toBe("old")
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("reports check_failed on non-200 manifest response", async () => {
    const dir = await mkdtemp(join(tmpdir(), "noodle-manifest-fail-"))
    try {
      const result = await runUpdate(true, true, {
        ...baseDeps(join(dir, "cache.json")),
        env: {},
        fetcher: async () => new Response(null, { status: 500 }),
      })
      expect(result.data.status).toBe("check_failed")
      expect(result.failed).toBe(true)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("represents asset missing in manifest", async () => {
    const dir = await mkdtemp(join(tmpdir(), "noodle-manifest-no-asset-"))
    try {
      const result = await runUpdate(true, true, {
        ...baseDeps(join(dir, "cache.json")),
        env: {},
        fetcher: async (input) => {
          const url = String(input)
          if (url.endsWith("update.json"))
            return new Response(
              makeManifest("v99.0.0", { "linux-x86_64": binaryHash }),
              { status: 200 },
            )
          return new Response()
        },
      })
      expect(result.data.status).toBe("asset_missing")
      expect(result.failed).toBe(true)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("returns up_to_date when manifest version matches current", async () => {
    const dir = await mkdtemp(join(tmpdir(), "noodle-manifest-current-"))
    try {
      const result = await runUpdate(true, true, {
        ...baseDeps(join(dir, "cache.json")),
        env: {},
        fetcher: async (input) => {
          const url = String(input)
          if (url.endsWith("update.json"))
            return new Response(
              makeManifest("v0.5.2", { "macos-arm64": binaryHash }),
              { status: 200 },
            )
          return new Response()
        },
      })
      expect(result.data.status).toBe("up_to_date")
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("returns up_to_date when manifest version is older", async () => {
    const dir = await mkdtemp(join(tmpdir(), "noodle-manifest-older-"))
    try {
      const result = await runUpdate(true, true, {
        ...baseDeps(join(dir, "cache.json")),
        env: {},
        fetcher: async (input) => {
          const url = String(input)
          if (url.endsWith("update.json"))
            return new Response(
              makeManifest("v0.4.9", { "macos-arm64": binaryHash }),
              { status: 200 },
            )
          return new Response()
        },
      })
      expect(result.data.status).toBe("up_to_date")
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("returns error for invalid manifest version", async () => {
    const dir = await mkdtemp(join(tmpdir(), "noodle-manifest-invalid-"))
    try {
      const result = await runUpdate(true, true, {
        ...baseDeps(join(dir, "cache.json")),
        env: {},
        fetcher: async (input) => {
          const url = String(input)
          if (url.endsWith("update.json"))
            return new Response(
              JSON.stringify({
                version: "not-valid",
                assets: { "macos-arm64": { sha256: binaryHash } },
              }),
              { status: 200 },
            )
          return new Response()
        },
      })
      expect(result.data.status).toBe("check_failed")
      expect(result.failed).toBe(true)
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

  it("returns false when running via bun runtime", () => {
    expect(isHomebrewInstall("/opt/homebrew/bin/bun")).toBe(false)
    expect(isHomebrewInstall("/opt/homebrew/bin/bunx")).toBe(false)
    expect(isHomebrewInstall("/usr/local/bin/bun")).toBe(false)
  })
})

describe("runUpdate dev mode", () => {
  it("does not attempt to update when running via bun runtime", async () => {
    let fetchCalled = false
    const result = await runUpdate(true, false, {
      execPath: "/opt/homebrew/bin/bun",
      platform: "darwin",
      arch: "arm64",
      env: {},
      now: () => 1000,
      cachePath: "/tmp/noodle-dev-cache.json",
      fetcher: async () => {
        fetchCalled = true
        return new Response()
      },
    })
    expect(result.data.status).toBe("dev_mode")
    expect(result.failed).toBe(true)
    expect(fetchCalled).toBe(false)
  })
})

describe("checkForUpdates", () => {
  const binaryDeps = (cachePath: string) => ({
    cachePath,
    now: () => 1000,
    execPath: "/tmp/noodle",
    platform: "darwin",
    arch: "arm64",
  })

  const checksums = { "macos-arm64": "a".repeat(64) }

  it("returns up_to_date for brew when outdated reports current", async () => {
    const status = await checkForUpdates(false, {
      execPath: "/opt/homebrew/bin/noodle",
      platform: "darwin",
      arch: "arm64",
      env: {},
      runProcess: async (_args, _capture) => ({ exitCode: 1 }),
    })
    expect(status.kind).toBe("up_to_date")
    expect(status.installType).toBe("brew")
    if (status.kind === "up_to_date") {
      expect(typeof status.currentVersion).toBe("string")
    }
  })

  it("returns update_available for brew when outdated finds newer", async () => {
    const status = await checkForUpdates(false, {
      execPath: "/opt/homebrew/bin/noodle",
      platform: "darwin",
      arch: "arm64",
      env: {},
      runProcess: async (_args, _capture) => ({ exitCode: 0 }),
    })
    expect(status.kind).toBe("update_available")
    expect(status.installType).toBe("brew")
    if (status.kind === "update_available") {
      expect(typeof status.latestVersion).toBe("string")
    }
  })

  it("returns error when brew is unavailable", async () => {
    const status = await checkForUpdates(false, {
      execPath: "/opt/homebrew/bin/noodle",
      platform: "darwin",
      arch: "arm64",
      env: {},
      runProcess: async () => {
        throw new Error("spawn failed")
      },
    })
    expect(status).toEqual({
      kind: "error",
      message: "Unable to check Homebrew. Is brew installed?",
      installType: "brew",
    })
  })

  it("returns up_to_date for binary when cache matches", async () => {
    const dir = await mkdtemp(join(tmpdir(), "noodle-check-cache-"))
    const path = join(dir, "update-cache.json")
    let networkCalls = 0
    try {
      await writeFile(path, makeCache("v0.5.2", 1000, checksums))
      const status = await checkForUpdates(false, {
        ...binaryDeps(path),
        env: {},
        fetcher: async () => {
          networkCalls += 1
          return new Response()
        },
      })
      expect(status.kind).toBe("up_to_date")
      if (status.kind === "up_to_date") {
        expect(status.installType).toBe("binary")
      }
      expect(networkCalls).toBe(0)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("returns update_available for binary when cache has newer release with checksum", async () => {
    const dir = await mkdtemp(join(tmpdir(), "noodle-check-newer-"))
    const path = join(dir, "update-cache.json")
    let networkCalls = 0
    try {
      await writeFile(path, makeCache("v99.0.0", 1000, checksums))
      const status = await checkForUpdates(false, {
        ...binaryDeps(path),
        env: {},
        fetcher: async () => {
          networkCalls += 1
          return new Response()
        },
      })
      expect(status.kind).toBe("update_available")
      expect(status.installType).toBe("binary")
      if (
        status.kind === "update_available" &&
        status.installType === "binary"
      ) {
        expect(status.latestVersion).toBe("v99.0.0")
        expect(status.assetUrl).toBe(
          "https://github.com/wilfredinni/noodle/releases/download/v99.0.0/noodle-macos-arm64",
        )
        expect(status.expectedSha256).toBe("a".repeat(64))
        expect(typeof status.currentVersion).toBe("string")
      }
      expect(networkCalls).toBe(0)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("fetches manifest and returns update_available when newer version exists", async () => {
    const dir = await mkdtemp(join(tmpdir(), "noodle-check-manifest-newer-"))
    const path = join(dir, "update-cache.json")
    try {
      const status = await checkForUpdates(true, {
        ...binaryDeps(path),
        env: {},
        fetcher: async () =>
          new Response(makeManifest("v99.0.0", checksums), { status: 200 }),
      })
      expect(status.kind).toBe("update_available")
      expect(status.installType).toBe("binary")
      if (
        status.kind === "update_available" &&
        status.installType === "binary"
      ) {
        expect(status.latestVersion).toBe("v99.0.0")
        expect(status.assetUrl).toBe(
          "https://github.com/wilfredinni/noodle/releases/download/v99.0.0/noodle-macos-arm64",
        )
        expect(status.expectedSha256).toBe("a".repeat(64))
      }
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("returns up_to_date when manifest version is current", async () => {
    const dir = await mkdtemp(join(tmpdir(), "noodle-check-manifest-current-"))
    const path = join(dir, "update-cache.json")
    try {
      const status = await checkForUpdates(true, {
        ...binaryDeps(path),
        env: {},
        fetcher: async () =>
          new Response(makeManifest("v0.5.2", checksums), { status: 200 }),
      })
      expect(status.kind).toBe("up_to_date")
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("returns error when manifest is invalid JSON", async () => {
    const dir = await mkdtemp(join(tmpdir(), "noodle-check-bad-json-"))
    const path = join(dir, "update-cache.json")
    try {
      const status = await checkForUpdates(true, {
        ...binaryDeps(path),
        env: {},
        fetcher: async () => new Response("not json", { status: 200 }),
      })
      expect(status.kind).toBe("error")
      if (status.kind === "error") {
        expect(status.message).toContain("Check failed")
      }
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("returns error when running via bun runtime (dev mode)", async () => {
    const status = await checkForUpdates(false, {
      execPath: "/opt/homebrew/bin/bun",
      platform: "darwin",
      arch: "arm64",
      env: {},
    })
    expect(status).toEqual({
      kind: "error",
      message:
        "Updates available only in standalone binary. Run `noodle update` instead.",
      installType: "binary",
    })
  })

  it("returns error when cache has newer version but no checksum for platform", async () => {
    const dir = await mkdtemp(join(tmpdir(), "noodle-check-missing-cs-"))
    const path = join(dir, "update-cache.json")
    try {
      await writeFile(
        path,
        makeCache("v99.0.0", 1000, { "linux-x86_64": "a".repeat(64) }),
      )
      const status = await checkForUpdates(false, {
        ...binaryDeps(path),
        env: {},
        fetcher: async () => new Response(),
      })
      expect(status.kind).toBe("error")
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe("installBinaryUpdate", () => {
  const binaryHash = "a".repeat(64)

  it("downloads and installs the binary with checksum verification", async () => {
    const dir = await mkdtemp(join(tmpdir(), "noodle-install-binary-"))
    const executable = join(dir, "noodle")
    const binary = new TextEncoder().encode("new")
    try {
      await writeFile(executable, "old")
      const result = await installBinaryUpdate(
        "v0.5.3",
        "https://example.com/noodle-binary",
        sha256(binary),
        {
          execPath: executable,
          platform: "darwin",
          arch: "arm64",
          env: {},
          fetcher: async (input) => {
            const url = String(input)
            if (url === "https://example.com/noodle-binary")
              return new Response(binary)
            return new Response()
          },
        },
      )
      expect(result.data).toEqual({ status: "updated", version: "v0.5.3" })
      expect(await readFile(executable, "utf8")).toBe("new")
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("does not replace binary when checksum fails", async () => {
    const dir = await mkdtemp(join(tmpdir(), "noodle-install-checksum-"))
    const executable = join(dir, "noodle")
    try {
      await writeFile(executable, "old")
      const result = await installBinaryUpdate(
        "v0.5.3",
        "https://example.com/noodle-binary",
        binaryHash,
        {
          execPath: executable,
          platform: "darwin",
          arch: "arm64",
          env: {},
          fetcher: async (input) => {
            const url = String(input)
            if (url === "https://example.com/noodle-binary")
              return new Response("new")
            return new Response()
          },
        },
      )
      expect(result.data.status).toBe("update_failed")
      expect(await readFile(executable, "utf8")).toBe("old")
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("returns failure when running via bun runtime (dev mode)", async () => {
    const result = await installBinaryUpdate(
      "v0.5.3",
      "https://example.com/noodle-binary",
      binaryHash,
      {
        execPath: "/opt/homebrew/bin/bun",
        platform: "darwin",
        arch: "arm64",
        env: {},
      },
    )
    expect(result.data.status).toBe("update_failed")
    expect(result.failed).toBe(true)
  })
})

describe("installBrewUpdate", () => {
  it("runs brew upgrade and returns success", async () => {
    let receivedArgs: string[] | undefined
    const result = await installBrewUpdate({
      execPath: "/opt/homebrew/bin/noodle",
      platform: "darwin",
      arch: "arm64",
      env: {},
      runProcess: async (args, capture) => {
        receivedArgs = args
        void capture
        return { exitCode: 0 }
      },
    })
    expect(result).toEqual({
      data: { status: "homebrew_updated", command: "brew upgrade noodle" },
    })
    expect(receivedArgs).toEqual(["brew", "upgrade", "noodle"])
  })

  it("reports brew upgrade failure", async () => {
    const result = await installBrewUpdate({
      execPath: "/opt/homebrew/bin/noodle",
      platform: "darwin",
      arch: "arm64",
      env: {},
      runProcess: async () => ({ exitCode: 1 }),
    })
    expect(result).toEqual({
      data: {
        status: "homebrew_failed",
        command: "brew upgrade noodle",
        exit_code: "1",
      },
      failed: true,
    })
  })

  it("returns failure when running via bun runtime (dev mode)", async () => {
    let processCalled = false
    const result = await installBrewUpdate({
      execPath: "/opt/homebrew/bin/bun",
      platform: "darwin",
      arch: "arm64",
      env: {},
      runProcess: async () => {
        processCalled = true
        return { exitCode: 0 }
      },
    })
    expect(result.data.status).toBe("homebrew_failed")
    expect(result.failed).toBe(true)
    expect(processCalled).toBe(false)
  })
})
