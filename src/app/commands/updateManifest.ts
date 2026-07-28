import { getPlatformString } from "./updateDetect"

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

export function getReleaseDownloadUrl(tag: string, name: string): string {
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
