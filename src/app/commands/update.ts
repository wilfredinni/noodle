import { defineCommand } from "citty"
import pkg from "../../../package.json" with { type: "json" }

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
  async run() {
    if (isHomebrewInstall(process.execPath)) {
      console.log("noodle was installed via Homebrew.")
      console.log("Run: brew upgrade noodle")
      return
    }

    const platform = getPlatformString(process.platform, process.arch)
    const currentVersion = `v${pkg.version}`

    console.log(`noodle ${currentVersion} (${platform})`)
    console.log("Checking for updates...")

    let releaseData: ReleaseData

    try {
      const response = await fetch(getReleaseApiUrl(), {
        headers: { Accept: "application/vnd.github+json" },
      })
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      const json = await response.json()
      if (!json || typeof json.tag_name !== "string" || !Array.isArray(json.assets)) {
        throw new Error("Invalid release data")
      }
      releaseData = json as ReleaseData
    } catch {
      console.log("Failed to check for updates.")
      return
    }

    if (!isNewerVersion(currentVersion, releaseData.tag_name)) {
      console.log("Already up to date.")
      return
    }

    const assetName = getAssetName(process.platform, process.arch)
    const asset = releaseData.assets.find((a) => a.name === assetName)

    if (!asset) {
      console.log(`No prebuilt binary found for ${platform}.`)
      console.log(
        "Build from source: git clone https://github.com/wilfredinni/noodle.git",
      )
      return
    }

    console.log(`Downloading ${releaseData.tag_name} for ${platform}...`)

    const response = await fetch(asset.browser_download_url)
    const buffer = await response.arrayBuffer()

    const tmpPath = process.execPath + ".new"
    await Bun.write(tmpPath, new Uint8Array(buffer))
    await Bun.spawn(["chmod", "+x", tmpPath]).exited
    await Bun.spawn(["mv", tmpPath, process.execPath]).exited

    console.log(`Updated to ${releaseData.tag_name}`)
  },
})
