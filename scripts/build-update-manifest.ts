import {
  compareStableVersions,
  parseManifest,
} from "../src/app/commands/updateManifest"

const OFFICIAL_ASSETS = [
  ["linux-arm64", "noodle-linux-arm64"],
  ["linux-x86_64", "noodle-linux-x86_64"],
  ["macos-arm64", "noodle-macos-arm64"],
  ["macos-x86_64", "noodle-macos-x86_64"],
  ["windows-arm64", "noodle-windows-arm64.exe"],
  ["windows-x86_64", "noodle-windows-x86_64.exe"],
] as const

interface Manifest {
  version: string
  assets: Record<string, { sha256: string }>
}

export interface ManifestBuildResult {
  status: "updated" | "current" | "newer_exists"
  contents?: string
}

function parseChecksums(source: string): Map<string, string> {
  const checksums = new Map<string, string>()
  for (const line of source.split("\n").filter(Boolean)) {
    const match = /^([a-f\d]{64})\s+\*?(\S+)$/i.exec(line)
    if (!match) throw new Error(`Invalid SHA256SUMS line: ${line}`)
    const [, checksum, name] = match
    if (checksums.has(name)) throw new Error(`Duplicate checksum for ${name}`)
    checksums.set(name, checksum.toLowerCase())
  }

  const expected = new Set<string>(OFFICIAL_ASSETS.map(([, name]) => name))
  for (const name of checksums.keys()) {
    if (!expected.has(name))
      throw new Error(`Unexpected release artifact in SHA256SUMS: ${name}`)
  }
  for (const name of expected) {
    if (!checksums.has(name)) throw new Error(`Missing checksum for ${name}`)
  }
  return checksums
}

function manifestsMatch(left: Manifest, right: Manifest): boolean {
  if (left.version !== right.version) return false
  const leftAssets = Object.entries(left.assets).sort(([a], [b]) =>
    a.localeCompare(b),
  )
  const rightAssets = Object.entries(right.assets).sort(([a], [b]) =>
    a.localeCompare(b),
  )
  return JSON.stringify(leftAssets) === JSON.stringify(rightAssets)
}

export function buildUpdateManifest(
  tag: string,
  checksumSource: string,
  currentSource: string,
): ManifestBuildResult {
  const current = parseManifest(currentSource)
  const checksums = parseChecksums(checksumSource)
  const candidate: Manifest = {
    version: tag,
    assets: Object.fromEntries(
      OFFICIAL_ASSETS.map(([platform, name]) => [
        platform,
        { sha256: checksums.get(name)! },
      ]),
    ),
  }
  parseManifest(JSON.stringify(candidate))

  const comparison = compareStableVersions(current.version, tag)
  if (comparison === null) throw new Error("Invalid update manifest version")
  if (comparison === -1) return { status: "newer_exists" }
  if (comparison === 0) {
    if (!manifestsMatch(current, candidate))
      throw new Error(`Manifest ${tag} does not match its published checksums`)
    return { status: "current" }
  }
  return {
    status: "updated",
    contents: `${JSON.stringify(candidate, null, 2)}\n`,
  }
}

function option(name: string): string {
  const index = Bun.argv.indexOf(name)
  const value = index === -1 ? undefined : Bun.argv[index + 1]
  if (!value) throw new Error(`Missing ${name}`)
  return value
}

async function main(): Promise<void> {
  const tag = option("--tag")
  const checksumPath = option("--checksums")
  const manifestPath = option("--manifest")
  const result = buildUpdateManifest(
    tag,
    await Bun.file(checksumPath).text(),
    await Bun.file(manifestPath).text(),
  )

  if (result.status === "updated") {
    await Bun.write(manifestPath, result.contents!)
    console.log(`Updated manifest to ${tag}`)
  } else if (result.status === "current") {
    console.log(`Manifest already publishes ${tag}`)
  } else {
    console.log(
      `Skipped ${tag}; the manifest already publishes a newer release`,
    )
  }
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error(
      `build-update-manifest: ${error instanceof Error ? error.message : String(error)}`,
    )
    process.exit(1)
  })
}
