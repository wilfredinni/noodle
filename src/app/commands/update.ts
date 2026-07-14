import { defineCommand } from "citty"
import pkg from "../../../package.json" with { type: "json" }
import { emitCommand } from "../commandResult"

export function getPlatformString(platform: string, arch: string): string {
  const os = platform === "darwin" ? "macos" : "linux"
  const cpu = arch === "arm64" ? "arm64" : "x86_64"
  return `${os}-${cpu}`
}

export function getAssetName(platform: string, arch: string): string {
  return `noodle-${getPlatformString(platform, arch)}`
}

export function isNewerVersion(current: string, latest: string): boolean {
  return current !== latest
}

export function isHomebrewInstall(execPath: string): boolean {
  return (
    execPath.includes("/homebrew") ||
    execPath.includes("/brew") ||
    execPath.includes("/.linuxbrew")
  )
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

  const platform = getPlatformString(process.platform, process.arch)
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
      !Array.isArray(json.assets)
    ) {
      throw new Error("Invalid release data")
    }
    releaseData = json as ReleaseData
  } catch {
    output("Failed to check for updates.")
    return { data: { status: "check_failed" }, failed: true }
  }

  if (!isNewerVersion(currentVersion, releaseData.tag_name)) {
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

  const response = await fetch(asset.browser_download_url)
  const buffer = await response.arrayBuffer()

  const tmpPath = process.execPath + ".new"
  await Bun.write(tmpPath, new Uint8Array(buffer))
  await Bun.spawn(["chmod", "+x", tmpPath]).exited
  await Bun.spawn(["mv", tmpPath, process.execPath]).exited

  output(`Updated to ${releaseData.tag_name}`)
  return { data: { status: "updated", version: releaseData.tag_name } }
}
