import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  readlink,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, relative } from "node:path"
import {
  getNoodleSkillPaths,
  installNoodleSkill,
  isNoodleSkillInstalled,
  NOODLE_SKILL_FILES,
} from "../src/agentSkill"

async function filesBelow(root: string): Promise<string[]> {
  const files: string[] = []
  async function walk(dir: string) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) await walk(path)
      else files.push(relative(root, path))
    }
  }
  await walk(root)
  return files.sort()
}

describe("Noodle agent skill installer", () => {
  let home: string

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "noodle-agent-skill-"))
  })

  afterEach(async () => {
    await rm(home, { recursive: true, force: true })
  })

  it("installs the exact embedded skill without touching the skill lock", async () => {
    const lockPath = join(home, ".agents", ".skill-lock.json")
    await mkdir(dirname(lockPath), { recursive: true })
    await writeFile(lockPath, "keep me")

    const result = await installNoodleSkill(home)

    expect(result).toEqual({
      action: "installed",
      path: getNoodleSkillPaths(home).canonical,
      linked: [],
    })
    expect(await filesBelow(result.path)).toEqual(
      Object.keys(NOODLE_SKILL_FILES).sort(),
    )
    for (const [path, contents] of Object.entries(NOODLE_SKILL_FILES)) {
      expect(await readFile(join(result.path, path), "utf8")).toBe(contents)
    }
    expect(await readFile(lockPath, "utf8")).toBe("keep me")
  })

  it("atomically replaces an existing canonical copy", async () => {
    const canonical = getNoodleSkillPaths(home).canonical
    await mkdir(canonical, { recursive: true })
    await writeFile(join(canonical, "obsolete.md"), "old")

    const result = await installNoodleSkill(home)

    expect(result.action).toBe("updated")
    expect(await filesBelow(canonical)).toEqual(
      Object.keys(NOODLE_SKILL_FILES).sort(),
    )
  })

  it("discovers Claude, Cursor, Codex, and OpenCode and links each one", async () => {
    await Promise.all(
      [".claude", ".cursor", ".codex", ".opencode"].map((dir) =>
        mkdir(join(home, dir), { recursive: true }),
      ),
    )

    const result = await installNoodleSkill(home)
    const expected = [
      join(home, ".claude", "skills", "noodle-use"),
      join(home, ".cursor", "skills", "noodle-use"),
      join(home, ".codex", "skills", "noodle-use"),
      join(home, ".config", "opencode", "skills", "noodle-use"),
    ]

    expect(result.linked).toEqual(expected)
    for (const path of expected) {
      expect((await lstat(path)).isSymbolicLink()).toBe(true)
      expect(await readlink(path)).toBe(result.path)
    }
  })

  it("detects and safely replaces a legacy tool-specific symlink", async () => {
    const outside = join(home, "outside")
    const target = join(home, ".claude", "skills", "noodle-use")
    await mkdir(outside, { recursive: true })
    await mkdir(dirname(target), { recursive: true })
    await writeFile(join(outside, "keep.md"), "keep")
    await symlink(outside, target, "dir")

    expect(await isNoodleSkillInstalled(home)).toBe(true)
    const result = await installNoodleSkill(home)

    expect(result.action).toBe("updated")
    expect(await readlink(target)).toBe(result.path)
    expect(await readFile(join(outside, "keep.md"), "utf8")).toBe("keep")
  })

  it("does not create tool links when no tool installation is present", async () => {
    expect(await isNoodleSkillInstalled(home)).toBe(false)
    const result = await installNoodleSkill(home)
    expect(result.linked).toEqual([])
  })

  it("recognizes the XDG OpenCode root", async () => {
    await mkdir(join(home, ".config", "opencode"), { recursive: true })
    const result = await installNoodleSkill(home)
    expect(result.linked).toEqual([
      join(home, ".config", "opencode", "skills", "noodle-use"),
    ])
  })
})
