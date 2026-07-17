import { defineCommand } from "citty"
import { createHash } from "node:crypto"
import { chmod, mkdtemp, rename, rm, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
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
  },
  async run({ args }) {
    if (args.json) return emitCommand(true, () => runUpdate(true))
    await runUpdate(false)
  },
})

async function runUpdate(
  silent: boolean,
): Promise<{ data: Record<string, string>; failed?: boolean }> {
  const output = (message: string) => {
    if (!silent) console.log(message)
  }
  if (isHomebrewInstall(process.execPath)) {
    output("noodle was installed via Homebrew.")
    output("Run: brew upgrade noodle")
    return { data: { status: "homebrew", command: "brew upgrade noodle" } }
  }

  let platform: string
  try {
    platform = getPlatformString(process.platform, process.arch)
  } catch {
    output(`Unsupported platform: ${process.platform}-${process.arch}`)
    return { data: { status: "unsupported_platform" }, failed: true }
  }
  const currentVersion = `v${pkg.version}`

  output(`noodle ${currentVersion} (${platform})`)
  output("Checking for updates...")

  let releaseData: ReleaseData

  try {
    const response = await fetch(getReleaseApiUrl(), {
      headers: { Accept: "application/vnd.github+json" },
    })
    if (!response.ok) {
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
  } catch {
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

  const assetName = getAssetName(process.platform, process.arch)
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
      fetch(asset.browser_download_url),
      fetch(getReleaseDownloadUrl(releaseData.tag_name, "SHA256SUMS")),
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

    const executableDir = dirname(process.execPath)
    stagingDir = await mkdtemp(join(executableDir, ".noodle-update-"))
    const stagedPath = join(stagingDir, assetName)
    await writeFile(stagedPath, binary, { mode: 0o755 })
    await chmod(stagedPath, 0o755)
    await rename(stagedPath, process.execPath)
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
