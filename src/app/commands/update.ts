import { defineCommand } from "citty"
import { createHash } from "node:crypto"
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises"
import { dirname, join } from "node:path"
import { homedir } from "node:os"
import pkg from "../../../package.json" with { type: "json" }
import { emitCommand } from "../commandResult"

export function getPlatformString(platform: string, arch: string): string {
  const os =
    platform === "darwin" ? "macos" : platform === "linux" ? "linux" : null
  const cpu = arch === "arm64" ? "arm64" : arch === "x64" ? "x86_64" : null
  if (!os || !cpu) throw new Error(`Unsupported platform: ${platform}-${arch}`)
  return `${os}-${cpu}`
}

export function getAssetName(platform: string, arch: string): string {
  return `noodle-${getPlatformString(platform, arch)}`
}

export function compareStableVersions(
  current: string,
  latest: string,
): number | null {
  const parse = (version: string): [number, number, number] | null => {
    const match = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(version)
    return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null
  }
  const currentParts = parse(current)
  const latestParts = parse(latest)
  if (!currentParts || !latestParts) return null
  for (let index = 0; index < 3; index += 1) {
    if (latestParts[index] !== currentParts[index])
      return latestParts[index] > currentParts[index] ? 1 : -1
  }
  return 0
}

export function isNewerVersion(current: string, latest: string): boolean {
  return compareStableVersions(current, latest) === 1
}

export function isHomebrewInstall(execPath: string): boolean {
  return (
    execPath.includes("/homebrew/bin/") ||
    execPath.includes("/linuxbrew/.linuxbrew/bin/") ||
    execPath.includes("/brew/bin/")
  )
}

export function parseChecksumManifest(
  manifest: string,
  assetName: string,
): string | null {
  for (const line of manifest.split(/\r?\n/)) {
    const fields = line.trim().split(/\s+/)
    if (
      fields.length >= 2 &&
      fields[1] === assetName &&
      /^[a-f\d]{64}$/i.test(fields[0])
    )
      return fields[0].toLowerCase()
  }
  return null
}

export function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex")
}

export const UPDATE_CACHE_TTL_MS = 60 * 60 * 1000

export interface UpdateCache {
  latestTag: string
  checkedAt: number
}

export function parseUpdateCache(value: unknown): UpdateCache | null {
  if (!value || typeof value !== "object") return null
  const cache = value as Record<string, unknown>
  if (
    typeof cache.latestTag !== "string" ||
    compareStableVersions(cache.latestTag, cache.latestTag) !== 0 ||
    typeof cache.checkedAt !== "number" ||
    !Number.isFinite(cache.checkedAt) ||
    cache.checkedAt < 0
  )
    return null
  return { latestTag: cache.latestTag, checkedAt: cache.checkedAt }
}

export function isFreshUpdateCache(cache: UpdateCache, now: number): boolean {
  return now >= cache.checkedAt && now - cache.checkedAt <= UPDATE_CACHE_TTL_MS
}

export async function loadUpdateCache(
  cachePath: string,
): Promise<UpdateCache | null> {
  try {
    return parseUpdateCache(JSON.parse(await readFile(cachePath, "utf8")))
  } catch {
    return null
  }
}

export async function saveUpdateCache(
  cachePath: string,
  cache: UpdateCache,
): Promise<void> {
  const cacheDir = dirname(cachePath)
  await mkdir(cacheDir, { recursive: true })
  const tempDir = await mkdtemp(join(cacheDir, ".update-cache-"))
  const tempPath = join(tempDir, "update-cache.json")
  try {
    await writeFile(tempPath, `${JSON.stringify(cache)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    })
    await rename(tempPath, cachePath)
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}

interface ReleaseAsset {
  name: string
  browser_download_url: string
}

interface ReleaseData {
  tag_name: string
  assets: ReleaseAsset[]
}

function getReleaseApiUrl(): string {
  return "https://api.github.com/repos/wilfredinni/noodle/releases/latest"
}

function getReleaseDownloadUrl(tag: string, name: string): string {
  return `https://github.com/wilfredinni/noodle/releases/download/${tag}/${name}`
}

function getDefaultCachePath(): string {
  return join(homedir(), ".config", "noodle", "update-cache.json")
}

export interface UpdateDependencies {
  fetcher: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  execPath: string
  platform: string
  arch: string
  env: Record<string, string | undefined>
  cachePath: string
  now: () => number
}

function getUpdateDeps(
  overrides: Partial<UpdateDependencies>,
): UpdateDependencies {
  return {
    fetcher: globalThis.fetch,
    execPath: process.execPath,
    platform: process.platform,
    arch: process.arch,
    env: process.env,
    cachePath: getDefaultCachePath(),
    now: Date.now,
    ...overrides,
  }
}

class RateLimitError extends Error {
  constructor(readonly retryAt?: string) {
    super("GitHub API rate limit reached")
  }
}

function getRateLimitError(response: Response): RateLimitError | null {
  const remaining = response.headers.get("x-ratelimit-remaining")
  if (
    response.status !== 429 &&
    !(response.status === 403 && remaining === "0")
  )
    return null
  const reset = Number(response.headers.get("x-ratelimit-reset"))
  return new RateLimitError(
    Number.isFinite(reset) && reset > 0
      ? new Date(reset * 1000).toISOString()
      : undefined,
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
    await runUpdate(false, force)
  },
})

export async function runUpdate(
  silent: boolean,
  force = false,
  dependencyOverrides: Partial<UpdateDependencies> = {},
): Promise<{ data: Record<string, string>; failed?: boolean }> {
  const deps = getUpdateDeps(dependencyOverrides)
  const output = (message: string) => {
    if (!silent) console.log(message)
  }
  if (isHomebrewInstall(deps.execPath)) {
    output("noodle was installed via Homebrew.")
    output("Run: brew upgrade noodle")
    return { data: { status: "homebrew", command: "brew upgrade noodle" } }
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
      if (cachedComparison === 0) {
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
  }

  let releaseData: ReleaseData

  try {
    const token = deps.env.GH_TOKEN || deps.env.GITHUB_TOKEN
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
    }
    if (token) headers.Authorization = `Bearer ${token}`
    const response = await deps.fetcher(getReleaseApiUrl(), {
      headers,
    })
    if (!response.ok) {
      const rateLimitError = getRateLimitError(response)
      if (rateLimitError) throw rateLimitError
      throw new Error(`HTTP ${response.status}`)
    }
    const json = await response.json()
    if (
      !json ||
      typeof json.tag_name !== "string" ||
      !Array.isArray(json.assets) ||
      json.assets.some(
        (asset: unknown) =>
          !asset ||
          typeof asset !== "object" ||
          typeof (asset as ReleaseAsset).name !== "string" ||
          typeof (asset as ReleaseAsset).browser_download_url !== "string",
      )
    ) {
      throw new Error("Invalid release data")
    }
    releaseData = json as ReleaseData
    const cache: UpdateCache = {
      latestTag: releaseData.tag_name,
      checkedAt: deps.now(),
    }
    if (parseUpdateCache(cache)) {
      try {
        await saveUpdateCache(deps.cachePath, cache)
      } catch {
        // A cache write must never prevent a valid update check.
      }
    }
  } catch (error) {
    if (error instanceof RateLimitError) {
      output("GitHub API rate limit reached.")
      if (error.retryAt) output(`Retry after ${error.retryAt}.`)
      const data: Record<string, string> = { status: "rate_limited" }
      if (error.retryAt) data.retry_at = error.retryAt
      return { data, failed: true }
    }
    output("Failed to check for updates.")
    return { data: { status: "check_failed" }, failed: true }
  }

  const versionComparison = compareStableVersions(
    currentVersion,
    releaseData.tag_name,
  )
  if (versionComparison === null) {
    output(`Invalid release version: ${releaseData.tag_name}`)
    return { data: { status: "invalid_release" }, failed: true }
  }
  if (versionComparison !== 1) {
    output("Already up to date.")
    return { data: { status: "up_to_date", version: currentVersion } }
  }

  const assetName = getAssetName(deps.platform, deps.arch)
  const asset = releaseData.assets.find((a) => a.name === assetName)

  if (!asset) {
    output(`No prebuilt binary found for ${platform}.`)
    output(
      "Build from source: git clone https://github.com/wilfredinni/noodle.git",
    )
    return { data: { status: "asset_missing", platform }, failed: true }
  }

  output(`Downloading ${releaseData.tag_name} for ${platform}...`)

  let stagingDir: string | undefined
  try {
    const [binaryResponse, checksumResponse] = await Promise.all([
      deps.fetcher(asset.browser_download_url),
      deps.fetcher(getReleaseDownloadUrl(releaseData.tag_name, "SHA256SUMS")),
    ])
    if (!binaryResponse.ok || !checksumResponse.ok)
      throw new Error(
        `HTTP ${binaryResponse.ok ? checksumResponse.status : binaryResponse.status}`,
      )

    const binary = new Uint8Array(await binaryResponse.arrayBuffer())
    const expectedHash = parseChecksumManifest(
      await checksumResponse.text(),
      assetName,
    )
    if (!expectedHash || sha256(binary) !== expectedHash)
      throw new Error("checksum mismatch")

    const executableDir = dirname(deps.execPath)
    stagingDir = await mkdtemp(join(executableDir, ".noodle-update-"))
    const stagedPath = join(stagingDir, assetName)
    await writeFile(stagedPath, binary, { mode: 0o755 })
    await chmod(stagedPath, 0o755)
    await rename(stagedPath, deps.execPath)
    output(`Updated to ${releaseData.tag_name}`)
    return { data: { status: "updated", version: releaseData.tag_name } }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    output(`Failed to update: ${reason}`)
    return { data: { status: "update_failed" }, failed: true }
  } finally {
    if (stagingDir) await rm(stagingDir, { recursive: true, force: true })
  }
}
