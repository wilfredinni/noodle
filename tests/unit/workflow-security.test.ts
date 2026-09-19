import { describe, expect, it } from "bun:test"
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { load } from "js-yaml"

const root = resolve(import.meta.dir, "../..")

interface Step {
  name?: string
  uses?: string
  with?: Record<string, unknown>
  run?: string
}

interface Job {
  concurrency?: { group?: string; "cancel-in-progress"?: boolean }
  if?: string
  needs?: string[]
  steps?: Step[]
  uses?: string
}

interface Workflow {
  concurrency?: { group?: string; "cancel-in-progress"?: string | boolean }
  jobs: Record<string, Job>
}

function workflow(name: string): Workflow {
  return load(
    readFileSync(resolve(root, ".github/workflows", name), "utf8"),
  ) as Workflow
}

function allUses(source: Workflow): string[] {
  return Object.values(source.jobs).flatMap((job) => [
    ...(job.uses ? [job.uses] : []),
    ...(job.steps?.flatMap((step) => (step.uses ? [step.uses] : [])) ?? []),
  ])
}

describe("workflow security boundaries", () => {
  const ci = workflow("ci.yml")
  const release = workflow("release.yml")
  const privilegedJobs = [
    "validate-release",
    "create-release",
    "build",
    "checksums",
    "notify-homebrew",
    "undraft",
    "publish-update-manifest",
  ]
  const adminGate = release.jobs["validate-release"].steps![0]

  it("pins every external action to a full commit SHA", () => {
    for (const uses of [...allUses(ci), ...allUses(release)]) {
      if (uses.startsWith("./")) continue
      expect(uses).toMatch(/^[^@\s]+@[a-f\d]{40}$/)
    }
  })

  it("cancels only superseded pull request CI runs", () => {
    expect(ci.concurrency).toEqual({
      group:
        "ci-${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}",
      "cancel-in-progress": "${{ github.event_name == 'pull_request' }}",
    })
  })

  it("disables checkout credentials except for the site publisher", () => {
    for (const job of Object.values({ ...ci.jobs, ...release.jobs })) {
      for (const step of job.steps ?? []) {
        if (!step.uses?.startsWith("actions/checkout@")) continue
        if (step.with?.repository === "wilfredinni/noodle-site") continue
        expect(step.with?.["persist-credentials"]).toBe(false)
      }
    }
  })

  it("requires repository admins at every privileged release boundary", () => {
    for (const name of privilegedJobs) {
      const job = release.jobs[name]
      expect(job.if).toContain("github.repository == 'wilfredinni/noodle'")
      expect(job.if).toContain("github.event_name == 'push'")
      expect(job.if).toContain("startsWith(github.ref, 'refs/tags/v')")
      expect(job.steps?.[0]).toEqual(adminGate)
    }
    expect(adminGate.run).toContain(
      '"$GITHUB_ACTOR" "$GITHUB_TRIGGERING_ACTOR"',
    )
  })

  it.skipIf(process.platform === "win32")(
    "fails closed unless both release actors are admins",
    () => {
      const directory = mkdtempSync(join(tmpdir(), "noodle-release-admin-"))
      try {
        const gh = join(directory, "gh")
        writeFileSync(
          gh,
          `#!/bin/sh
case "$2" in
  */collaborators/admin-*/permission) echo admin ;;
  */collaborators/writer/permission) echo write ;;
  *) exit 1 ;;
esac
`,
        )
        chmodSync(gh, 0o755)

        for (const [actor, triggeringActor, succeeds] of [
          ["admin-one", "admin-two", true],
          ["writer", "admin-two", false],
          ["admin-one", "writer", false],
          ["admin-one", "api-error", false],
        ] as const) {
          const result = Bun.spawnSync(["bash", "-c", adminGate.run!], {
            env: {
              ...process.env,
              PATH: `${directory}:${process.env.PATH}`,
              GITHUB_ACTOR: actor,
              GITHUB_TRIGGERING_ACTOR: triggeringActor,
              GITHUB_REPOSITORY: "wilfredinni/noodle",
            },
          })
          expect(result.exitCode === 0).toBe(succeeds)
        }
      } finally {
        rmSync(directory, { recursive: true, force: true })
      }
    },
  )

  it("blocks asset replacement after publication", () => {
    const upload = release.jobs.build.steps?.find(
      (step) => step.name === "Upload binary",
    )?.run
    const checksums = release.jobs.checksums.steps?.find(
      (step) => step.name === "Generate checksums and upload",
    )?.run
    expect(upload).toContain("isDraft")
    expect(upload).toContain("Refusing to replace assets")
    expect(checksums).toContain("isDraft")
    expect(checksums).toContain("Refusing to replace checksums")
  })

  it("serializes and recomputes site manifest publications", () => {
    const job = release.jobs["publish-update-manifest"]
    expect(job.needs).toContain("undraft")
    expect(job.concurrency).toEqual({
      group: "noodle-site-update",
      "cancel-in-progress": false,
    })
    const publish = job.steps?.find(
      (step) => step.name === "Publish update manifest",
    )?.run
    expect(publish).toContain("for attempt in 1 2 3")
    expect(publish).toContain("reset --hard origin/main")
    expect(publish).toContain("scripts/build-update-manifest.ts")
  })
})
