import { defineCommand } from "citty"
import pkg from "../../../package.json" with { type: "json" }
import { emitCommand } from "../commandResult"
import {
  getPlatformString,
  isHomebrewInstall,
  isBunRuntime,
} from "./updateDetect"
import {
  getAssetName,
  getReleaseDownloadUrl,
  compareStableVersions,
  loadUpdateCache,
  saveUpdateCache,
  isFreshUpdateCache,
  isStaleUpdateCache,
  parseUpdateCache,
  getUpdateDeps,
  fetchManifestWithRetry,
  type UpdateDependencies,
  type UpdateCache,
} from "./updateMetadata"
import { runHomebrewUpdate, downloadAndInstall } from "./updateInstall"

export type {
  UpdateStatus,
  UpdateAvailableInfo,
  UpdateCache,
  UpdateDependencies,
  ProcessResult,
} from "./updateMetadata"

export {
  getPlatformString,
  isHomebrewInstall,
  isBunRuntime,
} from "./updateDetect"

export {
  getAssetName,
  compareStableVersions,
  isNewerVersion,
  UPDATE_CACHE_TTL_MS,
  UPDATE_CACHE_STALE_MS,
  parseUpdateCache,
  isFreshUpdateCache,
  isStaleUpdateCache,
  loadUpdateCache,
  saveUpdateCache,
  parseManifest,
  checkForUpdates,
  getUpdateDeps,
} from "./updateMetadata"

export {
  sha256,
  parseChecksumManifest,
  installBinaryUpdate,
  installBrewUpdate,
} from "./updateInstall"

export async function runUpdate(
  silent: boolean,
  force = false,
  dependencyOverrides: Partial<UpdateDependencies> = {},
): Promise<{ data: Record<string, string>; failed?: boolean }> {
  const deps = getUpdateDeps(dependencyOverrides)
  const output = (message: string) => {
    if (!silent) console.log(message)
  }
  if (isBunRuntime(deps.execPath)) {
    output("Updates are only available for the standalone binary.")
    output("If installed via Homebrew, run: brew upgrade noodle")
    return { data: { status: "dev_mode" }, failed: true }
  }
  if (isHomebrewInstall(deps.execPath)) {
    return runHomebrewUpdate(silent, deps)
  }

  let platform: string
  try {
    platform = getPlatformString(deps.platform, deps.arch)
  } catch {
    output(`Unsupported platform: ${deps.platform}-${deps.arch}`)
    return { data: { status: "unsupported_platform" }, failed: true }
  }
  const currentVersion = `v${pkg.version}`

  output(`noodle ${currentVersion} (${platform})`)
  output("Checking for updates...")

  if (!force) {
    const cache = await loadUpdateCache(deps.cachePath)
    if (cache && isFreshUpdateCache(cache, deps.now())) {
      const cachedComparison = compareStableVersions(
        currentVersion,
        cache.latestTag,
      )
      if (cachedComparison === 0 || cachedComparison === -1) {
        output("Already up to date.")
        return {
          data: {
            status: "up_to_date",
            version: currentVersion,
            cached: "true",
          },
        }
      }
      if (cachedComparison === 1) {
        const expectedSha256 = cache.checksums[platform]
        if (expectedSha256) {
          output(`Using cached release ${cache.latestTag}.`)
          return downloadAndInstall(
            cache.latestTag,
            getReleaseDownloadUrl(
              cache.latestTag,
              getAssetName(deps.platform, deps.arch),
            ),
            expectedSha256,
            deps,
            output,
          )
        }
        output("Cached release missing checksum, re-fetching manifest.")
      }
    }
  }

  let tag: string
  let expectedSha256: string

  const manifestResult = await fetchManifestWithRetry(deps)
  if (manifestResult.ok) {
    const manifest = manifestResult.manifest
    const cache: UpdateCache = {
      latestTag: manifest.version,
      checkedAt: deps.now(),
      checksums: {},
    }
    for (const [p, asset] of Object.entries(manifest.assets)) {
      cache.checksums[p] = asset.sha256
    }
    if (parseUpdateCache(cache)) {
      try {
        await saveUpdateCache(deps.cachePath, cache)
      } catch {
        // A cache write must never prevent a valid update check.
      }
    }

    tag = manifest.version
    const asset = manifest.assets[platform]
    if (!asset) {
      output(`No prebuilt binary for ${platform} in update manifest.`)
      output(
        "Build from source: git clone https://github.com/wilfredinni/noodle.git",
      )
      return { data: { status: "asset_missing", platform }, failed: true }
    }
    expectedSha256 = asset.sha256
  } else {
    const staleCache = await loadUpdateCache(deps.cachePath)
    if (staleCache && isStaleUpdateCache(staleCache, deps.now())) {
      const staleComparison = compareStableVersions(
        currentVersion,
        staleCache.latestTag,
      )
      if (staleComparison === 1) {
        const sha = staleCache.checksums[platform]
        if (sha) {
          output(
            `Cannot reach update server; using cached ${staleCache.latestTag}.`,
          )
          return downloadAndInstall(
            staleCache.latestTag,
            getReleaseDownloadUrl(
              staleCache.latestTag,
              getAssetName(deps.platform, deps.arch),
            ),
            sha,
            deps,
            output,
          )
        }
      }
      if (staleComparison === 0 || staleComparison === -1) {
        output("Already up to date.")
        return {
          data: {
            status: "up_to_date",
            version: currentVersion,
            cached: "true",
          },
        }
      }
    }
    output(manifestResult.error ?? "Unable to reach update server")
    return { data: { status: "check_failed" }, failed: true }
  }

  const versionComparison = compareStableVersions(currentVersion, tag)
  if (versionComparison === null) {
    output(`Invalid release version in manifest: ${tag}`)
    return { data: { status: "invalid_release" }, failed: true }
  }
  if (versionComparison !== 1) {
    output("Already up to date.")
    return { data: { status: "up_to_date", version: currentVersion } }
  }

  return downloadAndInstall(
    tag,
    getReleaseDownloadUrl(tag, getAssetName(deps.platform, deps.arch)),
    expectedSha256,
    deps,
    output,
  )
}

export default defineCommand({
  meta: {
    name: "update",
    description: "Update noodle to the latest version",
  },
  args: {
    json: {
      type: "boolean",
      default: false,
      description: "Write one JSON result envelope to stdout",
    },
    force: {
      type: "boolean",
      default: false,
      description: "Ignore the one-hour update check cache",
    },
  },
  async run({ args }) {
    const force = args.force === true
    if (args.json) return emitCommand(true, () => runUpdate(true, force))
    const result = await runUpdate(false, force)
    if (result.failed) process.exitCode = 1
  },
})
