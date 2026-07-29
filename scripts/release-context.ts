import { existsSync } from "node:fs"
import { resolve } from "node:path"

type CommandResult = { exitCode: number; stdout: string; stderr: string }

const root = resolve(import.meta.dir, "..")

function run(command: string[], cwd = root): CommandResult {
  const result = Bun.spawnSync(command, { cwd, stdout: "pipe", stderr: "pipe" })
  return {
    exitCode: result.exitCode,
    stdout: new TextDecoder().decode(result.stdout).trim(),
    stderr: new TextDecoder().decode(result.stderr).trim(),
  }
}

function fail(message: string): never {
  console.error(`release:context: ${message}`)
  process.exit(1)
}

function option(name: string): string | undefined {
  const index = Bun.argv.indexOf(name)
  return index === -1 ? undefined : Bun.argv[index + 1]
}

function latestTag(): string {
  const result = run([
    "git",
    "tag",
    "--list",
    "v[0-9]*",
    "--sort=-version:refname",
  ])
  if (result.exitCode !== 0)
    fail(result.stderr || "unable to list release tags")
  const tag = result.stdout.split("\n").find(Boolean)
  if (!tag) fail("no vX.Y.Z release tag found; pass --from <tag>")
  return tag
}

function changedFiles(base: string): string[] {
  const result = run(["git", "diff", "--name-only", base])
  if (result.exitCode !== 0)
    fail(result.stderr || `unable to inspect changes after ${base}`)
  const files = result.stdout ? result.stdout.split("\n").filter(Boolean) : []
  const untracked = run(["git", "ls-files", "--others", "--exclude-standard"])
  if (untracked.exitCode !== 0)
    fail(untracked.stderr || "unable to inspect untracked files")
  return [
    ...new Set([
      ...files,
      ...(untracked.stdout ? untracked.stdout.split("\n").filter(Boolean) : []),
    ]),
  ].sort()
}

function commits(base: string): string[] {
  const result = run(["git", "log", "--format=%h %s", `${base}..HEAD`])
  if (result.exitCode !== 0)
    fail(result.stderr || `unable to inspect commits after ${base}`)
  return result.stdout ? result.stdout.split("\n").filter(Boolean) : []
}

const surfaces = [
  {
    match: (file: string) => file.startsWith("src/app/"),
    label: "CLI/app behavior",
    targets: ["README.md", "noodle-site CLI reference", "noodle-use"],
    impact: "Review CLI syntax, options, examples, and JSON/error behavior.",
  },
  {
    match: (file: string) =>
      ["src/schema/", "src/lang/", "src/filestore/", "src/env/"].some(
        (prefix) => file.startsWith(prefix),
      ),
    label: "collection/environment format",
    targets: ["noodle-site format/reference docs", "noodle-use"],
    impact:
      "Review collection, request, environment, and serialization guidance.",
  },
  {
    match: (file: string) => file.startsWith("src/ui/"),
    label: "UI, command palette, keybindings, or themes",
    targets: ["noodle-site relevant guides", "AGENTS.md", "src/ui/Tips.tsx"],
    impact:
      "Review user workflows and in-app tips; refresh screenshots only if the visual behavior materially changed.",
  },
  {
    match: (file: string) =>
      file.includes("overlay") ||
      file.includes("focus") ||
      file.includes("keymap"),
    label: "overlay/focus/event handling",
    targets: ["release notes"],
    impact: "Add a reliability note unless the documented interaction changed.",
  },
  {
    match: (file: string) =>
      file === "README.md" ||
      file === "scripts/install.sh" ||
      file.startsWith(".github/workflows/"),
    label: "installation/release flow",
    targets: ["README.md", "noodle-site installation docs"],
    impact:
      "Review install, update, release, binary, checksum, and Homebrew instructions.",
  },
  {
    match: (file: string) => file.startsWith(".agents/skills/"),
    label: "agent skills",
    targets: [
      "affected skill instructions",
      "noodle-site AI-agent-skills guide",
    ],
    impact: "Update only skills whose supported workflows changed.",
  },
]

const base = option("--from") ?? latestTag()
const siteDir = resolve(root, process.env.NOODLE_SITE_DIR ?? "../noodle-site")
if (!existsSync(siteDir))
  fail(`documentation checkout not found at ${siteDir}; set NOODLE_SITE_DIR`)

const files = changedFiles(base)
const commitList = commits(base)
const matched = surfaces.filter((surface) => files.some(surface.match))
const cliHelp = run(["bun", "src/app/cli.ts", "--help"])

console.log(`# Release context: ${base}..HEAD`)
console.log("")
console.log(`Documentation checkout: \`${siteDir}\``)
console.log("")
console.log("## Changed files")
console.log("")
if (files.length === 0) console.log("- No changed files detected.")
else files.forEach((file) => console.log(`- \`${file}\``))
console.log("")
console.log("## Relevant commits")
console.log("")
if (commitList.length === 0) console.log("- No commits detected.")
else commitList.forEach((commit) => console.log(`- ${commit}`))
console.log("")
console.log("## Candidate public impact")
console.log("")
if (matched.length === 0)
  console.log(
    "- No mapped public surface detected; review release notes for user-visible changes.",
  )
else {
  matched.forEach((surface) => {
    console.log(`- **${surface.label}** — ${surface.impact}`)
    console.log(`  Review: ${surface.targets.join(", ")}.`)
  })
}
console.log("")
console.log("## Evidence")
console.log("")
console.log(
  `- CLI help: ${cliHelp.exitCode === 0 ? "available" : "failed; inspect manually"}`,
)
console.log(
  "- Skill/reference map: available at `.agents/skills/noodle-release/references/public-surface-map.md`",
)
console.log("")
console.log("## AI review instruction")
console.log("")
console.log(
  "Use the evidence above, source files, tests, and current docs to draft only supported updates. Mark uncertain claims for maintainer review.",
)
