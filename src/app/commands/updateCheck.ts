import { homedir } from "node:os"
import { join } from "node:path"
import pkg from "../../../package.json" with { type: "json" }
import {
  getPlatformString,
  isHomebrewInstall,
  isBunRuntime,
} from "./updateDetect"
import { loadUpdateCache, isFreshUpdateCache } from "./updateCache"
import {
  getAssetName,
  getReleaseDownloadUrl,
  compareStableVersions,
  isNewerVersion,
} from "./updateManifest"
import { fetchManifestAndCheck } from "./updateFetch"

export interface UpdateDependencies {
  fetcher: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  runProcess: (
    args: string[],
    captureOutput: boolean,
    options?: {
      signal?: AbortSignal
      env?: Record<string, string | undefined>
    },
  ) => Promise<ProcessResult>
  execPath: string
  platform: string
  arch: string
  env: Record<string, string | undefined>
  cachePath: string
  now: () => number
  updateCheckTimeoutMs?: number
}

export const UPDATE_CHECK_TIMEOUT_MS = 10_000

export interface ProcessResult {
  exitCode: number
  stdout?: string
}

async function runProcess(
  args: string[],
  captureOutput: boolean,
  options?: {
    signal?: AbortSignal
    env?: Record<string, string | undefined>
  },
): Promise<ProcessResult> {
  const child = Bun.spawn(args, {
    stdout: captureOutput ? "pipe" : "inherit",
    stderr: captureOutput ? "pipe" : "inherit",
    signal: options?.signal,
    env: options?.env,
  })
  if (!captureOutput) return { exitCode: await child.exited }
  const [stdout] = await Promise.all([
    new Response(child.stdout).text(),
    child.exited,
    new Response(child.stderr).text(),
  ])
  return { exitCode: child.exitCode ?? 1, stdout }
}

function getDefaultCachePath(): string {
  return join(homedir(), ".config", "noodle", "update-cache.json")
}

export function getUpdateDeps(
  overrides: Partial<UpdateDependencies>,
): UpdateDependencies {
  return {
    fetcher: globalThis.fetch,
    runProcess,
    execPath: process.execPath,
    platform: process.platform,
    arch: process.arch,
    env: process.env,
    cachePath: getDefaultCachePath(),
    now: Date.now,
    updateCheckTimeoutMs: UPDATE_CHECK_TIMEOUT_MS,
    ...overrides,
  }
}

export type UpdateStatus =
  | {
      kind: "up_to_date"
      currentVersion: string
      installType: "binary" | "brew"
    }
  | {
      kind: "update_available"
      latestVersion: string
      currentVersion: string
      installType: "brew"
    }
  | {
      kind: "update_available"
      latestVersion: string
      currentVersion: string
      installType: "binary"
      assetUrl: string
      expectedSha256: string
    }
  | {
      kind: "error"
      message: string
      installType: "binary" | "brew"
    }

export interface UpdateAvailableInfo {
  version: string
  installType: "brew" | "binary"
  assetUrl?: string
  expectedSha256?: string
}

export async function checkForUpdates(
  force = false,
  dependencyOverrides: Partial<UpdateDependencies> = {},
): Promise<UpdateStatus> {
  const deps = getUpdateDeps(dependencyOverrides)
  const currentVersion = `v${pkg.version}`

  if (isBunRuntime(deps.execPath)) {
    return {
      kind: "error",
      message:
        "Updates are only available for the standalone binary. Use a release build instead.",
      installType: "binary",
    }
  }

  if (isHomebrewInstall(deps.execPath)) {
    try {
      const result = await deps.runProcess(
        ["brew", "info", "--json=v2", "noodle"],
        true,
        {
          signal: AbortSignal.timeout(
            deps.updateCheckTimeoutMs ?? UPDATE_CHECK_TIMEOUT_MS,
          ),
          env: deps.env,
        },
      )
      if (result.exitCode !== 0) {
        return {
          kind: "error",
          message: `brew info exited with status ${result.exitCode}`,
          installType: "brew",
        }
      }
      let latest: string | null = null
      try {
        const parsed = JSON.parse(result.stdout ?? "{}")
        const stable = parsed?.formulae?.[0]?.versions?.stable
        if (typeof stable === "string") latest = stable
      } catch {
        // fall through, latest stays null
      }
      if (latest === null) {
        return {
          kind: "error",
          message: "Unable to parse brew info output",
          installType: "brew",
        }
      }
      const latestVersion = `v${latest}`
      if (isNewerVersion(currentVersion, latestVersion)) {
        return {
          kind: "update_available",
          latestVersion,
          currentVersion,
          installType: "brew",
        }
      }
      return { kind: "up_to_date", currentVersion, installType: "brew" }
    } catch {
      return {
        kind: "error",
        message: "Unable to check Homebrew. Is brew installed?",
        installType: "brew",
      }
    }
  }

  try {
    getPlatformString(deps.platform, deps.arch)
  } catch {
    return {
      kind: "error",
      message: `Unsupported platform: ${deps.platform}-${deps.arch}`,
      installType: "binary",
    }
  }

  if (!force) {
    const cache = await loadUpdateCache(deps.cachePath)
    if (cache && isFreshUpdateCache(cache, deps.now())) {
      const comparison = compareStableVersions(currentVersion, cache.latestTag)
      if (comparison === 0 || comparison === -1) {
        return { kind: "up_to_date", currentVersion, installType: "binary" }
      }
      if (comparison === 1) {
        const platformKey = getPlatformString(deps.platform, deps.arch)
        const expectedSha256 = cache.checksums[platformKey]
        if (expectedSha256) {
          const assetName = getAssetName(deps.platform, deps.arch)
          return {
            kind: "update_available",
            latestVersion: cache.latestTag,
            currentVersion,
            installType: "binary",
            assetUrl: getReleaseDownloadUrl(cache.latestTag, assetName),
            expectedSha256,
          }
        }
      }
    }
  }

  return fetchManifestAndCheck(currentVersion, deps)
}
