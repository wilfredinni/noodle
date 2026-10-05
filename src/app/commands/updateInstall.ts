import { createHash } from "node:crypto"
import {
  appendFile,
  chmod,
  mkdtemp,
  rename,
  rm,
  writeFile,
} from "node:fs/promises"
import { dirname, join } from "node:path"
import windowsUpdateHelper from "../../../scripts/complete-windows-update.ps1" with { type: "text" }
import { isNoodleSkillInstalled } from "../../agentSkill"
import {
  isHomebrewInstall,
  isBunRuntime,
  getPlatformString,
} from "./updateDetect"
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

async function refreshInstalledSkill(
  installed: boolean,
  executable: string,
  deps: UpdateDependencies,
  output: (message: string) => void,
): Promise<Record<string, string>> {
  if (!installed) return {}
  try {
    const result = await deps.runProcess(
      [executable, "agent", "install", "--json"],
      true,
      { env: deps.env },
    )
    if (result.exitCode === 0) {
      output("Noodle skill updated.")
      return { skill_status: "updated" }
    }
  } catch {
    // The Noodle update remains successful; the warning below has the retry.
  }
  output("Warning: Noodle updated, but its skill could not be refreshed.")
  output("Retry with: noodle agent install")
  return {
    skill_status: "failed",
    skill_retry: "noodle agent install",
  }
}

async function hasInstalledSkill(deps: UpdateDependencies): Promise<boolean> {
  const home =
    deps.env.HOME ??
    (deps.platform === "win32" ? deps.env.USERPROFILE : undefined)
  if (home === undefined && deps.env !== process.env) return false
  return isNoodleSkillInstalled(home)
}

export async function installBinaryUpdate(
  tag: string,
  downloadUrl: string,
  expectedSha256: string,
  dependencyOverrides: Partial<UpdateDependencies> = {},
  onPhase?: (phase: "downloading" | "installing") => void,
): Promise<{ data: Record<string, string>; failed?: boolean }> {
  const deps = getUpdateDeps(dependencyOverrides)
  if (isBunRuntime(deps.execPath)) {
    return { data: { status: "update_failed" }, failed: true }
  }
  return downloadAndInstall(
    tag,
    downloadUrl,
    expectedSha256,
    deps,
    () => {},
    onPhase,
  )
}

async function downloadAndInstall(
  tag: string,
  binaryUrl: string,
  expectedSha256: string,
  deps: UpdateDependencies,
  output: (message: string) => void,
  onPhase?: (phase: "downloading" | "installing") => void,
): Promise<{ data: Record<string, string>; failed?: boolean }> {
  if (isHomebrewInstall(deps.execPath)) {
    output("Run: brew upgrade noodle")
    return {
      data: { status: "homebrew_managed", command: "brew upgrade noodle" },
      failed: true,
    }
  }
  const assetName = getAssetName(deps.platform, deps.arch)
  const platform = getPlatformString(deps.platform, deps.arch)
  const skillInstalled = await hasInstalledSkill(deps)
  output(`Downloading ${tag} for ${platform}...`)
  onPhase?.("downloading")
  let stagingDir: string | undefined
  let helperOwnsStaging = false
  let windowsLogPath: string | undefined
  try {
    const binaryResponse = await deps.fetcher(binaryUrl)
    if (!binaryResponse.ok) {
      throw new Error(`HTTP ${binaryResponse.status}`)
    }

    const binary = new Uint8Array(await binaryResponse.arrayBuffer())
    if (sha256(binary) !== expectedSha256) throw new Error("checksum mismatch")
    onPhase?.("installing")

    const executableDir = dirname(deps.execPath)
    stagingDir = await mkdtemp(join(executableDir, ".noodle-update-"))
    const stagedPath = join(stagingDir, assetName)
    await writeFile(stagedPath, binary, { mode: 0o755 })
    if (deps.platform === "win32") {
      const helperPath = join(stagingDir, "complete-update.ps1")
      const logPath = join(executableDir, ".noodle-update.log")
      windowsLogPath = logPath
      await writeFile(helperPath, windowsUpdateHelper)
      await writeFile(
        logPath,
        `Update ${tag} staged; waiting for Noodle to exit.\n`,
      )
      const powershell = deps.env.SystemRoot
        ? join(
            deps.env.SystemRoot,
            "System32",
            "WindowsPowerShell",
            "v1.0",
            "powershell.exe",
          )
        : "powershell.exe"
      const helperArgs = [
        powershell,
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        helperPath,
        "-ParentPid",
        String(process.pid),
        "-Source",
        stagedPath,
        "-Destination",
        deps.execPath,
        "-Version",
        tag,
        "-ExpectedSha256",
        expectedSha256,
        "-LogPath",
        logPath,
      ]
      if (skillInstalled) helperArgs.push("-RefreshSkill")
      await deps.startProcess(helperArgs, { env: deps.env })
      helperOwnsStaging = true
      output(`Update staged; restart Noodle to apply ${tag}.`)
      output(`Update details: ${logPath}`)
      return {
        data: {
          status: "restart_required",
          version: tag,
          log_path: logPath,
          ...(skillInstalled ? { skill_status: "pending" } : {}),
        },
      }
    }
    await chmod(stagedPath, 0o755)
    await rename(stagedPath, deps.execPath)
    output(`Updated to ${tag}`)
    const skill = await refreshInstalledSkill(
      skillInstalled,
      deps.execPath,
      deps,
      output,
    )
    return { data: { status: "updated", version: tag, ...skill } }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    if (windowsLogPath) {
      try {
        await appendFile(windowsLogPath, `Failed to stage update: ${reason}\n`)
      } catch {
        // The original executable remains intact even if diagnostics cannot be saved.
      }
    }
    output(`Failed to update: ${reason}`)
    return { data: { status: "update_failed", reason }, failed: true }
  } finally {
    if (stagingDir && !helperOwnsStaging) {
      try {
        await rm(stagingDir, { recursive: true, force: true })
      } catch {
        // cleanup is best-effort
      }
    }
  }
}

export { downloadAndInstall }
