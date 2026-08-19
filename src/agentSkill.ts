import { homedir } from "node:os"
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises"
import { dirname, join } from "node:path"
import skill from "../.agents/skills/noodle-use/SKILL.md" with { type: "text" }
import schema from "../.agents/skills/noodle-use/schema.md" with { type: "text" }
import automation from "../.agents/skills/noodle-use/workflows/automation.md" with { type: "text" }
import convert from "../.agents/skills/noodle-use/workflows/convert.md" with { type: "text" }
import create from "../.agents/skills/noodle-use/workflows/create.md" with { type: "text" }
import evaluate from "../.agents/skills/noodle-use/workflows/evaluate.md" with { type: "text" }
import importWorkflow from "../.agents/skills/noodle-use/workflows/import.md" with { type: "text" }
import organize from "../.agents/skills/noodle-use/workflows/organize.md" with { type: "text" }
import config from "../.agents/skills/noodle-use/reference/config.md" with { type: "text" }
import conventions from "../.agents/skills/noodle-use/reference/conventions.md" with { type: "text" }
import examples from "../.agents/skills/noodle-use/reference/examples.md" with { type: "text" }

export const NOODLE_SKILL_FILES = {
  "SKILL.md": skill,
  "schema.md": schema,
  "workflows/automation.md": automation,
  "workflows/convert.md": convert,
  "workflows/create.md": create,
  "workflows/evaluate.md": evaluate,
  "workflows/import.md": importWorkflow,
  "workflows/organize.md": organize,
  "reference/config.md": config,
  "reference/conventions.md": conventions,
  "reference/examples.md": examples,
} as const

export const NOODLE_SKILL_MARKER = ".noodle-managed"
const NOODLE_SKILL_MARKER_CONTENT = "noodle-use\n"

export interface AgentSkillInstallResult {
  action: "installed" | "updated"
  path: string
  linked: string[]
}

interface SkillReplacement {
  targetPath: string
  backupPath?: string
  device: number
  inode: number
}

class SkillReplacementError extends Error {
  constructor(
    message: string,
    readonly replacement: SkillReplacement,
    cause: unknown,
  ) {
    super(message, { cause })
  }
}

function userHome(home?: string): string {
  return home ?? process.env.HOME ?? homedir()
}

export function getNoodleSkillPaths(home?: string): {
  canonical: string
  recognized: string[]
} {
  const root = userHome(home)
  const canonical = join(root, ".agents", "skills", "noodle-use")
  return {
    canonical,
    recognized: [
      canonical,
      join(root, ".claude", "skills", "noodle-use"),
      join(root, ".cursor", "skills", "noodle-use"),
      join(root, ".codex", "skills", "noodle-use"),
      join(root, ".config", "opencode", "skills", "noodle-use"),
    ],
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false
    throw new Error(`Failed to inspect path ${path}`, { cause: error })
  }
}

async function hasManagedMarker(path: string): Promise<boolean> {
  try {
    return (
      (await readFile(join(path, NOODLE_SKILL_MARKER), "utf8")) ===
      NOODLE_SKILL_MARKER_CONTENT
    )
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false
    throw new Error(`Failed to read skill marker for ${path}`, {
      cause: error,
    })
  }
}

async function isUnmanagedPath(targetPath: string): Promise<boolean> {
  let info
  try {
    info = await lstat(targetPath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false
    throw new Error(`Failed to inspect skill path ${targetPath}`, {
      cause: error,
    })
  }

  if (info.isSymbolicLink()) return false
  return !(info.isDirectory() && (await hasManagedMarker(targetPath)))
}

function unmanagedPathsError(paths: string[]): Error {
  return new Error(
    `Refusing to replace unmanaged skill paths:\n${paths.map((path) => `- ${path}`).join("\n")}\nRetry with: noodle agent install --force`,
  )
}

async function assertReplaceablePath(targetPath: string, force = false) {
  if (!force && (await isUnmanagedPath(targetPath))) {
    throw unmanagedPathsError([targetPath])
  }
}

export async function isNoodleSkillInstalled(home?: string): Promise<boolean> {
  for (const path of getNoodleSkillPaths(home).recognized) {
    try {
      if (await exists(path)) return true
    } catch {
      return true
    }
  }
  return false
}

async function replacePath(
  stagedPath: string,
  targetPath: string,
  force = false,
): Promise<SkillReplacement> {
  const parent = dirname(targetPath)
  const stagedInfo = await lstat(stagedPath)
  let backupPath: string | undefined
  const replacement = (): SkillReplacement => ({
    targetPath,
    backupPath,
    device: stagedInfo.dev,
    inode: stagedInfo.ino,
  })
  if (await exists(targetPath)) {
    await assertReplaceablePath(targetPath, force)
    backupPath = await mkdtemp(join(parent, ".noodle-use-backup-"))
    await rm(backupPath, { recursive: true, force: true })
    await rename(targetPath, backupPath)
    try {
      await assertReplaceablePath(backupPath, force)
    } catch (error) {
      try {
        await rename(backupPath, targetPath)
      } catch (restoreError) {
        throw new SkillReplacementError(
          `Failed to restore ${targetPath}`,
          replacement(),
          restoreError,
        )
      }
      throw new Error(`Failed to validate backed-up skill path ${backupPath}`, {
        cause: error,
      })
    }
  }

  try {
    await rename(stagedPath, targetPath)
  } catch (error) {
    if (backupPath) {
      try {
        await rename(backupPath, targetPath)
      } catch (restoreError) {
        throw new SkillReplacementError(
          `Failed to replace and restore ${targetPath}`,
          replacement(),
          restoreError,
        )
      }
    }
    throw new Error(`Failed to replace ${targetPath}`, { cause: error })
  }

  return replacement()
}

async function withStagingCleanup(
  stagingRoot: string,
  operation: () => Promise<SkillReplacement>,
): Promise<SkillReplacement> {
  let replacement: SkillReplacement
  try {
    replacement = await operation()
  } catch (error) {
    try {
      await rm(stagingRoot, { recursive: true, force: true })
    } catch {
      // Preserve the installation error; the staging path is safe to leave.
    }
    throw error
  }

  try {
    await rm(stagingRoot, { recursive: true, force: true })
  } catch (error) {
    throw new SkillReplacementError(
      `Failed to clean up staging path ${stagingRoot}`,
      replacement,
      error,
    )
  }
  return replacement
}

async function discardBackups(replacements: SkillReplacement[]) {
  for (const { backupPath } of replacements) {
    if (backupPath) await rm(backupPath, { recursive: true, force: true })
  }
}

async function rollbackReplacements(replacements: SkillReplacement[]) {
  let firstError: unknown
  for (const replacement of replacements.reverse()) {
    const { targetPath, backupPath, device, inode } = replacement
    try {
      let current
      try {
        current = await lstat(targetPath)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
      }
      if (current && (current.dev !== device || current.ino !== inode)) {
        throw new Error(
          `Refusing to roll back changed skill path ${targetPath}${backupPath ? `; original preserved at ${backupPath}` : ""}`,
        )
      }
      if (current) await rm(targetPath, { recursive: true, force: true })
      if (backupPath) await rename(backupPath, targetPath)
    } catch (error) {
      firstError ??= error
    }
  }
  if (firstError) throw firstError
}

async function writeCanonicalSkill(path: string, force = false) {
  const parent = dirname(path)
  await mkdir(parent, { recursive: true })
  const stagingRoot = await mkdtemp(join(parent, ".noodle-use-stage-"))
  const stagedPath = join(stagingRoot, "noodle-use")
  return withStagingCleanup(stagingRoot, async () => {
    for (const [relativePath, contents] of Object.entries(NOODLE_SKILL_FILES)) {
      const filePath = join(stagedPath, relativePath)
      await mkdir(dirname(filePath), { recursive: true })
      await writeFile(filePath, contents)
    }
    await writeFile(
      join(stagedPath, NOODLE_SKILL_MARKER),
      NOODLE_SKILL_MARKER_CONTENT,
    )
    return await replacePath(stagedPath, path, force)
  })
}

async function linkSkill(
  targetPath: string,
  canonicalPath: string,
  force = false,
) {
  const parent = dirname(targetPath)
  await mkdir(parent, { recursive: true })
  const stagingRoot = await mkdtemp(join(parent, ".noodle-use-link-"))
  const stagedPath = join(stagingRoot, "noodle-use")
  return withStagingCleanup(stagingRoot, async () => {
    await symlink(canonicalPath, stagedPath, "dir")
    return await replacePath(stagedPath, targetPath, force)
  })
}

async function detectedToolLinks(home: string): Promise<string[]> {
  const tools = [
    [join(home, ".claude"), join(home, ".claude", "skills", "noodle-use")],
    [join(home, ".cursor"), join(home, ".cursor", "skills", "noodle-use")],
    [join(home, ".codex"), join(home, ".codex", "skills", "noodle-use")],
  ] as const
  const links: string[] = []
  for (const [root, target] of tools) {
    if (await exists(root)) links.push(target)
  }
  if (
    (await exists(join(home, ".opencode"))) ||
    (await exists(join(home, ".config", "opencode")))
  ) {
    links.push(join(home, ".config", "opencode", "skills", "noodle-use"))
  }
  return links
}

export async function installNoodleSkill(
  home?: string,
  force = false,
): Promise<AgentSkillInstallResult> {
  const root = userHome(home)
  const { canonical } = getNoodleSkillPaths(root)
  const action = (await isNoodleSkillInstalled(root)) ? "updated" : "installed"
  const linked = await detectedToolLinks(root)
  const targetPaths = [canonical, ...linked]

  if (!force) {
    const unmanaged: string[] = []
    for (const target of targetPaths) {
      if (await isUnmanagedPath(target)) unmanaged.push(target)
    }
    if (unmanaged.length) throw unmanagedPathsError(unmanaged)
  }

  const replacements: SkillReplacement[] = []
  try {
    replacements.push(await writeCanonicalSkill(canonical, force))
    for (const target of linked) {
      replacements.push(await linkSkill(target, canonical, force))
    }
  } catch (error) {
    if (error instanceof SkillReplacementError) {
      replacements.push(error.replacement)
    }
    try {
      await rollbackReplacements(replacements)
    } catch (rollbackError) {
      throw new Error(
        `Agent skill installation failed and rollback was incomplete: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`,
        { cause: rollbackError },
      )
    }
    throw error
  }
  await discardBackups(replacements)

  return { action, path: canonical, linked }
}
