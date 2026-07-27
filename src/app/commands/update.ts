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
import { lstatSync, realpathSync } from "node:fs"
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

function isHomebrewPath(p: string): boolean {
  return (
    p.includes("/homebrew/") ||
    p.includes("/.linuxbrew/") ||
    p.includes("/usr/local/Cellar/") ||
    p.includes("/usr/local/Homebrew/") ||
    p.includes("/brew/bin/")
  )
}

const HOMEBREW_BIN_PREFIXES = [
  "/usr/local/bin/",
  "/opt/homebrew/bin/",
  "/home/linuxbrew/.linuxbrew/bin/",
]

export function isHomebrewInstall(execPath: string): boolean {
  if (isBunRuntime(execPath)) return false
  if (isHomebrewPath(execPath)) return true
  try {
    if (isHomebrewPath(realpathSync(execPath))) return true
  } catch {
    try {
      if (
        HOMEBREW_BIN_PREFIXES.some((p) => execPath.startsWith(p)) &&
        lstatSync(execPath).isSymbolicLink()
      ) {
        return true
      }
    } catch {
      // stat failed too, file doesn't exist
    }
  }
  return false
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
export const UPDATE_CACHE_STALE_MS = 7 * 24 * 60 * 60 * 1000

export interface UpdateCache {
  latestTag: string
  checkedAt: number
  checksums: Record<string, string>
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
  const checksums = cache.checksums
  if (!checksums || typeof checksums !== "object") return null
  const normalized: Record<string, string> = {}
  for (const [key, hash] of Object.entries(checksums)) {
    if (typeof key !== "string" || typeof hash !== "string") return null
    if (!/^[a-f\d]{64}$/i.test(hash)) return null
    normalized[key] = hash.toLowerCase()
  }
  if (Object.keys(normalized).length === 0) return null
  return {
    latestTag: cache.latestTag,
    checkedAt: cache.checkedAt,
    checksums: normalized,
  }
}

export function isFreshUpdateCache(cache: UpdateCache, now: number): boolean {
  return now >= cache.checkedAt && now - cache.checkedAt <= UPDATE_CACHE_TTL_MS
}

export function isStaleUpdateCache(cache: UpdateCache, now: number): boolean {
  return (
    now >= cache.checkedAt && now - cache.checkedAt <= UPDATE_CACHE_STALE_MS
  )
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

function getManifestUrl(): string {
  return "https://noodlerest.dev/update.json"
}

function getReleaseDownloadUrl(tag: string, name: string): string {
  return `https://github.com/wilfredinni/noodle/releases/download/${tag}/${name}`
}

interface UpdateManifest {
  version: string
  assets: Record<string, { sha256: string }>
}

export function parseManifest(json: string): UpdateManifest {
  let obj: unknown
  try {
    obj = JSON.parse(json)
  } catch (e) {
    throw new Error("Invalid JSON in update manifest", { cause: e })
  }
  if (!obj || typeof obj !== "object") {
    throw new Error("Update manifest must be a JSON object")
  }
  const m = obj as Record<string, unknown>
  if (typeof m.version !== "string") {
    throw new Error("Update manifest missing version field")
  }
  if (compareStableVersions(m.version, m.version) === null) {
    throw new Error(`Invalid version in update manifest: ${m.version}`)
  }
  if (!m.assets || typeof m.assets !== "object") {
    throw new Error("Update manifest missing assets field")
  }
  const assets = m.assets as Record<string, unknown>
  const parsed: Record<string, { sha256: string }> = {}
  for (const [platform, value] of Object.entries(assets)) {
    if (
      !value ||
      typeof value !== "object" ||
      typeof (value as Record<string, unknown>).sha256 !== "string" ||
      !/^[a-f\d]{64}$/i.test(
        (value as Record<string, unknown>).sha256 as string,
      )
    ) {
      throw new Error(
        `Invalid asset entry in update manifest for platform ${platform}`,
      )
    }
    parsed[platform] = {
      sha256: (
        (value as Record<string, unknown>).sha256 as string
      ).toLowerCase(),
    }
  }
  return { version: m.version, assets: parsed }
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
  stdout?: string
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
  const [stdout] = await Promise.all([
    new Response(child.stdout).text(),
    child.exited,
    new Response(child.stderr).text(),
  ])
  return { exitCode: child.exitCode ?? 1, stdout }
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
        latest = parsed?.formulae?.[0]?.versions?.stable ?? null
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

async function fetchManifestAndCheck(
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

interface ManifestFetchResult {
  ok: true
  manifest: UpdateManifest
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

async function fetchManifestWithRetry(
  deps: UpdateDependencies,
): Promise<ManifestFetchOutcome> {
  const first = await fetchManifestOnce(deps)
  if (first.ok || !first.transient) return first

  await new Promise((resolve) => setTimeout(resolve, 500))
  return fetchManifestOnce(deps)
}

export async function installBinaryUpdate(
  tag: string,
  downloadUrl: string,
  expectedSha256: string,
  dependencyOverrides: Partial<UpdateDependencies> = {},
): Promise<{ data: Record<string, string>; failed?: boolean }> {
  const deps = getUpdateDeps(dependencyOverrides)
  if (isBunRuntime(deps.execPath)) {
    return { data: { status: "update_failed" }, failed: true }
  }
  return downloadAndInstall(tag, downloadUrl, expectedSha256, deps, () => {})
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

async function downloadAndInstall(
  tag: string,
  binaryUrl: string,
  expectedSha256: string,
  deps: UpdateDependencies,
  output: (message: string) => void,
): Promise<{ data: Record<string, string>; failed?: boolean }> {
  const assetName = getAssetName(deps.platform, deps.arch)
  const platform = getPlatformString(deps.platform, deps.arch)
  output(`Downloading ${tag} for ${platform}...`)
  let stagingDir: string | undefined
  try {
    const binaryResponse = await deps.fetcher(binaryUrl)
    if (!binaryResponse.ok) {
      throw new Error(`HTTP ${binaryResponse.status}`)
    }

    const binary = new Uint8Array(await binaryResponse.arrayBuffer())
    if (sha256(binary) !== expectedSha256) throw new Error("checksum mismatch")

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
    return { data: { status: "update_failed", reason }, failed: true }
  } finally {
    if (stagingDir) {
      try {
        await rm(stagingDir, { recursive: true, force: true })
      } catch {
        // cleanup is best-effort
      }
    }
  }
}
