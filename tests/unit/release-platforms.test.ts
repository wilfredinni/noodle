import { describe, expect, it } from "bun:test"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { load } from "js-yaml"

const root = resolve(import.meta.dir, "../..")
const officialAssets = [
  "noodle-linux-arm64",
  "noodle-linux-x86_64",
  "noodle-macos-arm64",
  "noodle-macos-x86_64",
  "noodle-windows-arm64.exe",
  "noodle-windows-x86_64.exe",
]
const officialTargets = [
  "darwin-arm64",
  "darwin-x64",
  "linux-arm64",
  "linux-x64",
  "win32-arm64",
  "win32-x64",
]

interface MatrixJob {
  needs?: string[]
  strategy?: { matrix?: { include?: Record<string, string>[] } }
  steps?: { name?: string; run?: string }[]
}

function workflow(name: string): { jobs: Record<string, MatrixJob> } {
  return load(readFileSync(joinWorkflow(name), "utf8")) as {
    jobs: Record<string, MatrixJob>
  }
}

function joinWorkflow(name: string): string {
  return resolve(root, ".github/workflows", name)
}

describe("official platform workflows", () => {
  it("runs the full suite and standalone checks on six native CI runners", () => {
    const ci = workflow("ci.yml")
    const job = ci.jobs.platform
    const targets = job.strategy?.matrix?.include?.map((row) => row.target)
    expect(targets?.sort()).toEqual([...officialTargets].sort())
    const commands = job.steps?.map((step) => step.run ?? "").join("\n") ?? ""
    expect(commands).toContain("bun test")
    expect(commands).toContain("bun build --compile")
    expect(commands).toContain("compiled-script-smoke.ts")
    expect(commands).toContain("build-response-file-native.ts --target=")
    expect(commands).not.toContain("musl")
  })

  it("builds and natively validates all six release artifacts", () => {
    const release = workflow("release.yml")
    const builds = release.jobs.build.strategy?.matrix?.include?.map(
      (row) => row.asset,
    )
    const validations = release.jobs[
      "validate-artifact"
    ].strategy?.matrix?.include?.map((row) => row.asset)
    expect(builds?.sort()).toEqual([...officialAssets].sort())
    expect(validations?.sort()).toEqual([...officialAssets].sort())

    const checksumStep = release.jobs.checksums.steps?.find(
      (step) => step.name === "Generate checksums and upload",
    )?.run
    expect(checksumStep).toContain("= 6")
    for (const asset of officialAssets) expect(checksumStep).toContain(asset)

    expect(release.jobs.undraft.needs).toContain("validate-artifact")
    expect(release.jobs["notify-homebrew"].needs).toContain("undraft")
    expect(release.jobs["publish-update-manifest"].needs).toContain("undraft")
  })

  it("publishes six update keys without changing Windows asset extensions", () => {
    const release = workflow("release.yml")
    const manifest = release.jobs["publish-update-manifest"].steps?.find(
      (step) => step.name === "Build update manifest",
    )?.run
    for (const key of [
      "linux-arm64",
      "linux-x86_64",
      "macos-arm64",
      "macos-x86_64",
      "windows-arm64",
      "windows-x86_64",
    ])
      expect(manifest).toContain(`\\"${key}\\"`)
    expect(manifest).toContain("noodle-windows-arm64.exe")
    expect(manifest).toContain("noodle-windows-x86_64.exe")
  })
})
