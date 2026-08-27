import { existsSync } from "node:fs"
import { resolve } from "node:path"

type Check = { label: string; command: string[]; cwd?: string }

const root = resolve(import.meta.dir, "..")
const siteDir = resolve(root, process.env.NOODLE_SITE_DIR ?? "../noodle-site")
const requestedTag = process.argv.includes("--tag")
  ? process.argv[process.argv.indexOf("--tag") + 1]
  : undefined

function run(check: Check): number {
  console.log(`\n▶ ${check.label}`)
  const result = Bun.spawnSync(check.command, {
    cwd: check.cwd ?? root,
    stdout: "inherit",
    stderr: "inherit",
  })
  if (result.exitCode !== 0) console.error(`✗ ${check.label} failed`)
  else console.log(`✓ ${check.label}`)
  return result.exitCode
}

const checks: Check[] = [
  { label: "tests", command: ["bun", "test"] },
  { label: "dependency audit", command: ["bun", "run", "audit"] },
  { label: "lint", command: ["bun", "run", "lint"] },
  { label: "typecheck", command: ["bun", "run", "typecheck"] },
  {
    label: "format",
    command: ["bunx", "oxfmt", "--check", "./src", "./tests"],
  },
  { label: "binary build", command: ["bun", "run", "build:bin"] },
]

if (requestedTag && !/^v\d+\.\d+\.\d+$/.test(requestedTag)) {
  console.error(`release:check: invalid tag ${requestedTag}; expected vX.Y.Z`)
  process.exit(1)
}

const packageFile = (await Bun.file(resolve(root, "package.json")).json()) as {
  version: string
}
if (requestedTag && requestedTag !== `v${packageFile.version}`) {
  console.error(
    `release:check: ${requestedTag} does not match package.json version ${packageFile.version}`,
  )
  process.exit(1)
}

if (requestedTag) {
  checks.unshift({
    label: "release notes",
    command: ["bun", "scripts/release-notes.ts", "--tag", requestedTag],
  })
}

let failed = false
for (const check of checks) {
  if (run(check) !== 0) failed = true
}

if (!existsSync(siteDir)) {
  console.error(
    `\nrelease:check: documentation checkout not found at ${siteDir}; set NOODLE_SITE_DIR`,
  )
  failed = true
} else if (
  run({
    label: "documentation site build",
    command: ["bun", "run", "build"],
    cwd: siteDir,
  }) !== 0
) {
  failed = true
}

if (failed) process.exit(1)
console.log("\nRelease checks passed.")
