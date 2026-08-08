import { createHash } from "node:crypto"
import { chmod, mkdtemp, rename, rm, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { isBunRuntime, getPlatformString } from "./updateDetect"
import type { UpdateDependencies } from "./updateMetadata"
import { getAssetName, getUpdateDeps } from "./updateMetadata"

export function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex")
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

async function runHomebrewUpdate(
  silent: boolean,
  deps: UpdateDependencies,
): Promise<{ data: Record<string, string>; failed?: boolean }> {
  const output = (message: string) => {
    if (!silent) console.log(message)
  }
  output("Updating noodle via Homebrew...")
  try {
    const result = await deps.runProcess(
      ["brew", "upgrade", "noodle"],
      silent,
      {
        env: deps.env,
      },
    )
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

export { runHomebrewUpdate, downloadAndInstall }
