import { homedir } from "node:os"
import {
  lstat,
  mkdir,
  mkdtemp,
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

export interface AgentSkillInstallResult {
  action: "installed" | "updated"
  path: string
  linked: string[]
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
    throw error
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

async function replacePath(stagedPath: string, targetPath: string) {
  const parent = dirname(targetPath)
  let backupPath: string | undefined
  if (await exists(targetPath)) {
    backupPath = await mkdtemp(join(parent, ".noodle-use-backup-"))
    await rm(backupPath, { recursive: true, force: true })
    await rename(targetPath, backupPath)
  }

  try {
    await rename(stagedPath, targetPath)
  } catch (error) {
    if (backupPath) await rename(backupPath, targetPath)
    throw new Error(`Failed to replace ${targetPath}`, { cause: error })
  }

  if (backupPath) await rm(backupPath, { recursive: true, force: true })
}

async function writeCanonicalSkill(path: string) {
  const parent = dirname(path)
  await mkdir(parent, { recursive: true })
  const stagingRoot = await mkdtemp(join(parent, ".noodle-use-stage-"))
  const stagedPath = join(stagingRoot, "noodle-use")
  try {
    for (const [relativePath, contents] of Object.entries(NOODLE_SKILL_FILES)) {
      const filePath = join(stagedPath, relativePath)
      await mkdir(dirname(filePath), { recursive: true })
      await writeFile(filePath, contents)
    }
    await replacePath(stagedPath, path)
  } finally {
    await rm(stagingRoot, { recursive: true, force: true })
  }
}

async function linkSkill(targetPath: string, canonicalPath: string) {
  const parent = dirname(targetPath)
  await mkdir(parent, { recursive: true })
  const stagingRoot = await mkdtemp(join(parent, ".noodle-use-link-"))
  const stagedPath = join(stagingRoot, "noodle-use")
  try {
    await symlink(canonicalPath, stagedPath, "dir")
    await replacePath(stagedPath, targetPath)
  } finally {
    await rm(stagingRoot, { recursive: true, force: true })
  }
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
): Promise<AgentSkillInstallResult> {
  const root = userHome(home)
  const { canonical } = getNoodleSkillPaths(root)
  const action = (await isNoodleSkillInstalled(root)) ? "updated" : "installed"
  const linked = await detectedToolLinks(root)

  await writeCanonicalSkill(canonical)
  for (const target of linked) await linkSkill(target, canonical)

  return { action, path: canonical, linked }
}
