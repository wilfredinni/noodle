import type { UpdateDependencies, UpdateStatus } from "./updateCheck"
import {
  saveUpdateCache,
  isStaleUpdateCache,
  loadUpdateCache,
  parseUpdateCache,
  type UpdateCache,
} from "./updateCache"
import {
  getAssetName,
  getReleaseDownloadUrl,
  compareStableVersions,
  parseManifest,
} from "./updateManifest"
import { getPlatformString } from "./updateDetect"

interface ManifestFetchResult {
  ok: true
  manifest: { version: string; assets: Record<string, { sha256: string }> }
  error?: undefined
}

interface ManifestFetchError {
  ok: false
  manifest?: undefined
  error: string
  transient: boolean
}

type ManifestFetchOutcome = ManifestFetchResult | ManifestFetchError

function isTransientError(status: number): boolean {
  return status === 0 || status >= 500
}

function getManifestUrl(): string {
  return "https://noodlerest.dev/update.json"
}

async function fetchManifestOnce(
  deps: UpdateDependencies,
): Promise<ManifestFetchOutcome> {
  try {
    const response = await deps.fetcher(getManifestUrl())
    if (!response.ok) {
      const status = response.status
      const transient = isTransientError(status)
      if (!transient) {
        return { ok: false, error: `HTTP ${status}`, transient: false }
      }
      return { ok: false, error: `HTTP ${status}`, transient: true }
    }
    const json = await response.text()
    const manifest = parseManifest(json)
    return { ok: true, manifest }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return { ok: false, error: `Check failed: ${msg}`, transient: true }
  }
}

export async function fetchManifestWithRetry(
  deps: UpdateDependencies,
): Promise<ManifestFetchOutcome> {
  const first = await fetchManifestOnce(deps)
  if (first.ok || !first.transient) return first

  await new Promise((resolve) => setTimeout(resolve, 500))
  return fetchManifestOnce(deps)
}

export async function fetchManifestAndCheck(
  currentVersion: string,
  deps: UpdateDependencies,
): Promise<UpdateStatus> {
  const manifestResult = await fetchManifestWithRetry(deps)

  if (manifestResult.ok) {
    const manifest = manifestResult.manifest
    const cache: UpdateCache = {
      latestTag: manifest.version,
      checkedAt: deps.now(),
      checksums: {},
    }
    for (const [platform, asset] of Object.entries(manifest.assets)) {
      cache.checksums[platform] = asset.sha256
    }
    if (parseUpdateCache(cache)) {
      try {
        await saveUpdateCache(deps.cachePath, cache)
      } catch {
        // A cache write must never prevent a valid update check.
      }
    }

    const versionComparison = compareStableVersions(
      currentVersion,
      manifest.version,
    )
    if (versionComparison !== 1) {
      return { kind: "up_to_date", currentVersion, installType: "binary" }
    }

    const platformKey = getPlatformString(deps.platform, deps.arch)
    const asset = manifest.assets[platformKey]
    if (!asset) {
      return {
        kind: "error",
        message: `No prebuilt binary for ${platformKey} in update manifest`,
        installType: "binary",
      }
    }

    const assetName = getAssetName(deps.platform, deps.arch)
    return {
      kind: "update_available",
      latestVersion: manifest.version,
      currentVersion,
      installType: "binary",
      assetUrl: getReleaseDownloadUrl(manifest.version, assetName),
      expectedSha256: asset.sha256,
    }
  }

  const cache = await loadUpdateCache(deps.cachePath)
  if (cache && isStaleUpdateCache(cache, deps.now())) {
    const comparison = compareStableVersions(currentVersion, cache.latestTag)
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
    if (comparison === 0 || comparison === -1) {
      return { kind: "up_to_date", currentVersion, installType: "binary" }
    }
  }

  return {
    kind: "error",
    message: manifestResult.error ?? "Unable to reach update server",
    installType: "binary",
  }
}
