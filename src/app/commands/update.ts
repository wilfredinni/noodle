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
  if (isBunRuntime(execPath)) return false
  return (
    execPath.includes("/homebrew/bin/") ||
    execPath.includes("/.linuxbrew/bin/") ||
    execPath.includes("/brew/bin/")
  )
}

function isBunRuntime(execPath: string): boolean {
  const name = execPath.split("/").pop() ?? ""
  return name === "bun" || name === "bunx" || name.startsWith("bun-")
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
  runProcess: (args: string[], captureOutput: boolean) => Promise<ProcessResult>
  execPath: string
  platform: string
  arch: string
  env: Record<string, string | undefined>
  cachePath: string
  now: () => number
}

export interface ProcessResult {
  exitCode: number
}

async function runProcess(
  args: string[],
  captureOutput: boolean,
): Promise<ProcessResult> {
  const child = Bun.spawn(args, {
    stdout: captureOutput ? "pipe" : "inherit",
    stderr: captureOutput ? "pipe" : "inherit",
  })
  if (!captureOutput) return { exitCode: await child.exited }
  await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ])
  return { exitCode: child.exitCode ?? 1 }
}

function getUpdateDeps(
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
    ...overrides,
  }
}

class RateLimitError extends Error {
  constructor(readonly retryAt?: string) {
    super("GitHub API rate limit reached")
  }
}

async function runHomebrewUpdate(
  silent: boolean,
  deps: UpdateDependencies,
): Promise<{ data: Record<string, string>; failed?: boolean }> {
  const output = (message: string) => {
    if (!silent) console.log(message)
  }
  output("Updating noodle via Homebrew...")
  try {
    const result = await deps.runProcess(["brew", "upgrade", "noodle"], silent)
    if (result.exitCode !== 0) {
      output(`Homebrew upgrade failed (exit code ${result.exitCode}).`)
      return {
        data: {
          status: "homebrew_failed",
          command: "brew upgrade noodle",
          exit_code: String(result.exitCode),
        },
        failed: true,
      }
    }
    output("Homebrew upgrade completed.")
    return {
      data: { status: "homebrew_updated", command: "brew upgrade noodle" },
    }
  } catch {
    output("Unable to run Homebrew. Is `brew` installed and available on PATH?")
    return {
      data: { status: "homebrew_failed", command: "brew upgrade noodle" },
      failed: true,
    }
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
    }
  | {
      kind: "error"
      message: string
      installType: "binary" | "brew"
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
        "Updates available only in standalone binary. Run `noodle update` instead.",
      installType: "binary",
    }
  }

  if (isHomebrewInstall(deps.execPath)) {
    try {
      const result = await deps.runProcess(
        ["brew", "outdated", "--quiet", "noodle"],
        true,
      )
      if (result.exitCode === 0) {
        return {
          kind: "update_available",
          latestVersion: "",
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

  let platform: string
  try {
    platform = getPlatformString(deps.platform, deps.arch)
  } catch {
    return {
      kind: "error",
      message: `Unsupported platform: ${deps.platform}-${deps.arch}`,
      installType: "binary",
    }
  }

  let cachedTag: string | undefined
  if (!force) {
    const cache = await loadUpdateCache(deps.cachePath)
    if (cache && isFreshUpdateCache(cache, deps.now())) {
      const comparison = compareStableVersions(currentVersion, cache.latestTag)
      if (comparison === 0 || comparison === -1) {
        return { kind: "up_to_date", currentVersion, installType: "binary" }
      }
      if (comparison === 1) {
        cachedTag = cache.latestTag
      }
    }
  }

  if (cachedTag) {
    const assetName = getAssetName(deps.platform, deps.arch)
    return {
      kind: "update_available",
      latestVersion: cachedTag,
      currentVersion,
      installType: "binary",
      assetUrl: getReleaseDownloadUrl(cachedTag, assetName),
    }
  }

  try {
    const token = deps.env.GH_TOKEN || deps.env.GITHUB_TOKEN
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
    }
    if (token) headers.Authorization = `Bearer ${token}`
    const response = await deps.fetcher(getReleaseApiUrl(), { headers })
    if (!response.ok) {
      const rateLimitError = getRateLimitError(response)
      if (rateLimitError) {
        const msg = rateLimitError.retryAt
          ? `GitHub rate limited. Retry after ${rateLimitError.retryAt}.`
          : "GitHub API rate limit reached."
        return { kind: "error", message: msg, installType: "binary" }
      }
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
    const releaseData = json as ReleaseData

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

    const versionComparison = compareStableVersions(
      currentVersion,
      releaseData.tag_name,
    )
    if (versionComparison === null) {
      return {
        kind: "error",
        message: `Invalid release version: ${releaseData.tag_name}`,
        installType: "binary",
      }
    }
    if (versionComparison !== 1) {
      return { kind: "up_to_date", currentVersion, installType: "binary" }
    }

    const assetName = getAssetName(deps.platform, deps.arch)
    const asset = releaseData.assets.find((a) => a.name === assetName)
    if (!asset) {
      return {
        kind: "error",
        message: `No prebuilt binary for ${platform}.`,
        installType: "binary",
      }
    }

    return {
      kind: "update_available",
      latestVersion: releaseData.tag_name,
      currentVersion,
      installType: "binary",
      assetUrl: asset.browser_download_url,
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return {
      kind: "error",
      message: `Check failed: ${msg}`,
      installType: "binary",
    }
  }
}

export async function installBinaryUpdate(
  tag: string,
  downloadUrl: string,
  dependencyOverrides: Partial<UpdateDependencies> = {},
): Promise<{ data: Record<string, string>; failed?: boolean }> {
  const deps = getUpdateDeps(dependencyOverrides)
  if (isBunRuntime(deps.execPath)) {
    return { data: { status: "update_failed" }, failed: true }
  }
  return downloadAndInstall(tag, downloadUrl, deps, () => {})
}

export async function installBrewUpdate(
  dependencyOverrides: Partial<UpdateDependencies> = {},
): Promise<{ data: Record<string, string>; failed?: boolean }> {
  const deps = getUpdateDeps(dependencyOverrides)
  if (isBunRuntime(deps.execPath)) {
    return {
      data: { status: "homebrew_failed", command: "brew upgrade noodle" },
      failed: true,
    }
  }
  return runHomebrewUpdate(true, deps)
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
        output(`Using cached release ${cache.latestTag}.`)
        return downloadAndInstall(
          cache.latestTag,
          getReleaseDownloadUrl(
            cache.latestTag,
            getAssetName(deps.platform, deps.arch),
          ),
          deps,
          output,
        )
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

  return downloadAndInstall(
    releaseData.tag_name,
    asset.browser_download_url,
    deps,
    output,
  )
}

async function downloadAndInstall(
  tag: string,
  binaryUrl: string,
  deps: UpdateDependencies,
  output: (message: string) => void,
): Promise<{ data: Record<string, string>; failed?: boolean }> {
  const assetName = getAssetName(deps.platform, deps.arch)
  const platform = getPlatformString(deps.platform, deps.arch)
  output(`Downloading ${tag} for ${platform}...`)
  let stagingDir: string | undefined
  try {
    const [binaryResponse, checksumResponse] = await Promise.all([
      deps.fetcher(binaryUrl),
      deps.fetcher(getReleaseDownloadUrl(tag, "SHA256SUMS")),
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
    output(`Updated to ${tag}`)
    return { data: { status: "updated", version: tag } }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    output(`Failed to update: ${reason}`)
    return { data: { status: "update_failed" }, failed: true }
  } finally {
    if (stagingDir) await rm(stagingDir, { recursive: true, force: true })
  }
}
