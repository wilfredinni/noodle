import { describe, expect, it } from "bun:test"
import { createHash } from "node:crypto"
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { load } from "js-yaml"

const root = resolve(import.meta.dir, "../..")
const signingScript = join(root, "scripts/sign-macos-binary.ts")
type Workflow = {
  on: Record<string, unknown>
  permissions: Record<string, string>
  concurrency: { group: string; "cancel-in-progress": boolean | string }
  jobs: Record<
    string,
    {
      needs?: string[]
      permissions?: Record<string, string>
      "runs-on"?: string
      env?: Record<string, string>
      strategy?: { matrix: { include: { os: string; target: string }[] } }
      steps?: {
        name?: string
        run?: string
        uses?: string
        if?: string
        with?: Record<string, unknown>
      }[]
    }
  >
}
const workflow = load(
  readFileSync(join(root, ".github/workflows/release.yml"), "utf8"),
) as Workflow
const ci = load(
  readFileSync(join(root, ".github/workflows/ci.yml"), "utf8"),
) as Workflow
const releaseTargets = [
  "macos-arm64",
  "macos-x86_64",
  "linux-x86_64",
  "linux-arm64",
]

describe("release platforms", () => {
  it("keeps tag publication and read-only builds with rerunnable artifact transfers", () => {
    expect(workflow.on.push).toEqual({ tags: ["v*"] })
    expect(workflow.concurrency["cancel-in-progress"]).toBe(false)
    expect(workflow.permissions).toEqual({ contents: "read" })
    expect(workflow.jobs.build.permissions).toEqual({ contents: "read" })
    expect(workflow.jobs["validate-macos-artifact"].permissions).toEqual({
      contents: "write",
    })
    expect(ci.permissions).toEqual({ contents: "read" })
    for (const config of [ci, workflow]) {
      for (const job of Object.values(config.jobs)) {
        for (const step of job.steps ?? []) {
          if (step.uses) expect(step.uses).toMatch(/@[a-f0-9]{40}$/)
          if (
            step.uses?.startsWith("actions/checkout@") &&
            step.with?.repository !== "wilfredinni/noodle-site"
          ) {
            expect(step.with?.["persist-credentials"]).toBe(false)
          }
        }
      }
    }
    const upload = workflow.jobs.build.steps!.find((step) =>
      step.uses?.startsWith("actions/upload-artifact@"),
    )!
    expect(upload.with).toMatchObject({
      name: "release-${{ matrix.target }}",
      path: "noodle-${{ matrix.target }}",
      "if-no-files-found": "error",
      overwrite: true,
    })
    expect(
      workflow.jobs.build.steps!.some((step) =>
        step.run?.includes("gh release"),
      ),
    ).toBe(false)
    const download = workflow.jobs.checksums.steps!.find((step) =>
      step.uses?.startsWith("actions/download-artifact@"),
    )!
    expect(download.with).toEqual({
      pattern: "release-*",
      path: "release-assets",
      "merge-multiple": true,
    })
    expect(workflow.jobs.checksums.needs).toContain("build")
  })

  it("tests and builds the same four platforms and validates both macOS artifacts", () => {
    const builds = workflow.jobs.build.strategy!.matrix.include
    expect(builds).toEqual([
      { os: "macos-15", target: "macos-arm64" },
      { os: "macos-15-intel", target: "macos-x86_64" },
      { os: "ubuntu-latest", target: "linux-x86_64" },
      { os: "ubuntu-24.04-arm", target: "linux-arm64" },
    ])
    expect(
      ci.jobs["response-files"].strategy!.matrix.include.map(
        ({ os, target }) => ({
          os,
          target: target
            .replace(/^darwin-/, "macos-")
            .replace(/-x64$/, "-x86_64"),
        }),
      ),
    ).toEqual(expect.arrayContaining(builds))
    expect(ci.jobs["response-files"].strategy!.matrix.include).toHaveLength(4)
    const validation = workflow.jobs["validate-macos-artifact"]
    expect(validation.strategy!.matrix.include).toEqual(
      builds.filter(({ target }) => target.startsWith("macos-")),
    )
    for (const job of [
      ci.jobs["response-files"],
      workflow.jobs.build,
      validation,
    ]) {
      expect(job["runs-on"]).toBe("${{ matrix.os }}")
    }
    expect(validation.env?.ASSET_NAME).toBe("noodle-${{ matrix.target }}")
  })

  it.skipIf(process.platform === "win32").each([
    { scenario: "complete", targets: releaseTargets, valid: true },
    {
      scenario: "missing Intel Mac",
      targets: releaseTargets.filter((target) => target !== "macos-x86_64"),
      valid: false,
    },
    {
      scenario: "unexpected replacement",
      targets: releaseTargets.map((target) =>
        target === "macos-x86_64" ? "unexpected" : target,
      ),
      valid: false,
    },
    {
      scenario: "extra asset",
      targets: [...releaseTargets, "unexpected"],
      valid: false,
    },
    {
      scenario: "empty binary",
      targets: releaseTargets,
      valid: false,
      empty: "macos-arm64",
    },
    {
      scenario: "already published",
      targets: releaseTargets,
      valid: false,
      draft: "false",
    },
    {
      scenario: "release lookup fails",
      targets: releaseTargets,
      valid: false,
      draft: "error",
    },
  ])(
    "checks release assets and update metadata: $scenario",
    ({ targets, valid, draft = "true", empty }) => {
      const directory = mkdtempSync(join(tmpdir(), "noodle-release-assets-"))
      try {
        const fixtures = join(directory, "release-assets")
        mkdirSync(fixtures)
        for (const target of targets) {
          writeFileSync(
            join(fixtures, `noodle-${target}`),
            target === empty ? "" : target,
          )
        }
        const gh = join(directory, "gh")
        writeFileSync(
          gh,
          '#!/bin/sh\ncase "$1 $2" in\n"release view") [ "$DRAFT" != error ] || exit 1; echo "$DRAFT" ;;\n"release upload") printf "%s\\n" "$@" > uploaded ;;\n*) exit 1 ;;\nesac\n',
        )
        chmodSync(gh, 0o755)
        if (process.platform === "darwin") {
          const checksum = join(directory, "sha256sum")
          writeFileSync(checksum, '#!/bin/sh\nexec shasum -a 256 "$@"\n')
          chmodSync(checksum, 0o755)
        }
        const runStep = (job: string, name: string) => {
          const step = workflow.jobs[job].steps!.find(
            (step) => step.name === name,
          )!
          return Bun.spawnSync(["bash", "-c", step.run!], {
            cwd: directory,
            env: {
              ...process.env,
              PATH: `${directory}:${process.env.PATH}`,
              TAG: "v0.9.1",
              DRAFT: draft,
            },
          })
        }
        expect(
          runStep("checksums", "Generate checksums and upload").exitCode,
        ).toBe(valid ? 0 : 1)
        expect(existsSync(join(directory, "uploaded"))).toBe(valid)
        if (!valid) return
        expect(
          readFileSync(join(directory, "uploaded"), "utf8").trim().split("\n"),
        ).toEqual([
          "release",
          "upload",
          "v0.9.1",
          ...releaseTargets
            .map((target) => `release-assets/noodle-${target}`)
            .sort(),
          "release-assets/SHA256SUMS",
          "--clobber",
        ])

        const checksums = readFileSync(
          join(directory, "release-assets/SHA256SUMS"),
          "utf8",
        )
        const expectedAssets = Object.fromEntries(
          releaseTargets.map((target) => [
            target,
            { sha256: createHash("sha256").update(target).digest("hex") },
          ]),
        )
        expect(checksums.trim().split("\n").sort()).toEqual(
          releaseTargets
            .map(
              (target) => `${expectedAssets[target].sha256}  noodle-${target}`,
            )
            .sort(),
        )
        writeFileSync(join(directory, "SHA256SUMS"), checksums)
        expect(
          runStep("publish-update-manifest", "Build update manifest").exitCode,
        ).toBe(0)
        expect(
          JSON.parse(readFileSync(join(directory, "update.json"), "utf8")),
        ).toEqual({ version: "v0.9.1", assets: expectedAssets })

        writeFileSync(
          join(directory, "SHA256SUMS"),
          checksums
            .split("\n")
            .filter((line) => !line.endsWith("noodle-macos-x86_64"))
            .join("\n"),
        )
        const missingIntel = runStep(
          "publish-update-manifest",
          "Build update manifest",
        )
        expect(missingIntel.exitCode).not.toBe(0)
        expect(missingIntel.stderr.toString()).toContain(
          "Missing macos-x86_64 checksum",
        )
      } finally {
        rmSync(directory, { recursive: true, force: true })
      }
    },
  )
})

describe("manual CI builds", () => {
  it("isolates PR cancellation and only uploads explicitly dispatched test builds", () => {
    expect(ci.on).toHaveProperty("workflow_dispatch")
    expect(ci.on).toHaveProperty("workflow_call")
    expect(ci.concurrency).toEqual({
      group:
        "ci-${{ github.workflow }}-${{ github.event.pull_request.number || github.run_id }}",
      "cancel-in-progress": "${{ github.event_name == 'pull_request' }}",
    })
    const steps = ci.jobs["response-files"].steps!
    const compile = steps.find(
      (step) => step.name === "Test shipped addon inside standalone executable",
    )!.run!
    expect(compile).toContain(
      "bun scripts/compiled-script-smoke.ts ./noodle-response-smoke",
    )
    expect(compile).toContain("./noodle-response-smoke --version")
    expect(compile.indexOf("sign-macos-binary.ts")).toBeLessThan(
      compile.indexOf("compiled-script-smoke.ts"),
    )
    for (const name of [
      "Package test build",
      "Upload test build",
      "Link test build",
    ]) {
      expect(steps.find((step) => step.name === name)!.if).toBe(
        "github.event_name == 'workflow_dispatch'",
      )
    }
    expect(
      steps.find((step) => step.name === "Upload test build")!.with,
    ).toMatchObject({
      path: "noodle-test-${{ matrix.target }}.tar.gz",
      archive: false,
      "if-no-files-found": "error",
      overwrite: true,
      "retention-days": 7,
    })
    expect(
      steps.findIndex((step) => step.name === "Package test build"),
    ).toBeGreaterThan(
      steps.findIndex(
        (step) => step.name === "Independently rebuild and test native source",
      ),
    )
  })

  it.skipIf(process.platform === "win32")(
    "packages an executable with its checksum and build identity",
    () => {
      const directory = mkdtempSync(join(tmpdir(), "noodle-test-build-"))
      try {
        const binary = '#!/bin/sh\nprintf "0.9.1\\n"\n'
        const commit = "0123456789abcdef0123456789abcdef01234567"
        for (const [file, content] of Object.entries({
          "noodle-response-smoke": binary,
          git: `#!/bin/sh\necho ${commit}\n`,
          bun: "#!/bin/sh\necho 1.4.0\n",
        })) {
          writeFileSync(join(directory, file), content, { mode: 0o755 })
        }
        const step = ci.jobs["response-files"].steps!.find(
          (step) => step.name === "Package test build",
        )!
        const packed = Bun.spawnSync(["bash", "-c", step.run!], {
          cwd: directory,
          env: {
            ...process.env,
            PATH: `${directory}:${process.env.PATH}`,
            TARGET: "darwin-arm64",
          },
        })
        expect(packed.exitCode).toBe(0)
        const extracted = join(directory, "extracted")
        mkdirSync(extracted)
        expect(
          Bun.spawnSync([
            "tar",
            "-xzf",
            join(directory, "noodle-test-darwin-arm64.tar.gz"),
            "-C",
            extracted,
          ]).exitCode,
        ).toBe(0)
        expect(readdirSync(extracted).sort()).toEqual([
          "BUILD_INFO.txt",
          "SHA256SUMS",
          "noodle",
        ])
        expect(statSync(join(extracted, "noodle")).mode & 0o777).toBe(0o755)
        expect(readFileSync(join(extracted, "noodle"), "utf8")).toBe(binary)
        expect(readFileSync(join(extracted, "SHA256SUMS"), "utf8")).toBe(
          `${createHash("sha256").update(binary).digest("hex")}  noodle\n`,
        )
        expect(readFileSync(join(extracted, "BUILD_INFO.txt"), "utf8")).toBe(
          `commit=${commit}\ntarget=darwin-arm64\nversion=0.9.1\nbun=1.4.0\n`,
        )
        expect(
          Bun.spawnSync([
            join(extracted, "noodle"),
            "--version",
          ]).stdout.toString(),
        ).toBe("0.9.1\n")
      } finally {
        rmSync(directory, { recursive: true, force: true })
      }
    },
  )
})

describe("macOS release signing", () => {
  it.skipIf(process.platform !== "darwin")(
    "signs an executable and fails for a missing binary or argument",
    () => {
      const directory = mkdtempSync(join(tmpdir(), "noodle-signing-"))
      const binary = join(directory, "binary with spaces")
      try {
        copyFileSync("/bin/echo", binary)
        const signed = Bun.spawnSync([process.execPath, signingScript, binary])
        expect(signed.exitCode).toBe(0)
        const verified = Bun.spawnSync([
          "/usr/bin/codesign",
          "--verify",
          "--strict",
          binary,
        ])
        expect(verified.exitCode).toBe(0)
        expect(Bun.spawnSync([binary, "signed-ok"]).stdout.toString()).toBe(
          "signed-ok\n",
        )

        expect(
          Bun.spawnSync([
            process.execPath,
            signingScript,
            join(directory, "missing"),
          ]).exitCode,
        ).not.toBe(0)
        expect(
          Bun.spawnSync([process.execPath, signingScript]).exitCode,
        ).not.toBe(0)
      } finally {
        rmSync(directory, { recursive: true, force: true })
      }
    },
  )

  it.skipIf(process.platform === "darwin")(
    "does nothing on other platforms without requiring codesign or a binary",
    () => {
      expect(Bun.spawnSync([process.execPath, signingScript]).exitCode).toBe(0)
    },
  )

  it
    .skipIf(process.platform !== "darwin")
    .each(["noodle-macos-arm64", "noodle-macos-x86_64"])(
    "rejects %s with a matching checksum but an invalid signature",
    (assetName) => {
      const directory = mkdtempSync(join(tmpdir(), "noodle-release-gate-"))
      try {
        const assets = join(directory, "release-assets")
        mkdirSync(assets)
        const binary = "#!/bin/sh\necho unsigned-binary-ran >&2\n"
        const path = join(assets, assetName)
        writeFileSync(path, binary)
        chmodSync(path, 0o755)
        const hash = createHash("sha256").update(binary).digest("hex")
        writeFileSync(join(assets, "SHA256SUMS"), `${hash}  ${assetName}\n`)
        const step = workflow.jobs["validate-macos-artifact"]?.steps?.find(
          (step) => step.name === "Verify downloaded macOS binary",
        )
        expect(step?.run).toBeDefined()
        const result = Bun.spawnSync(["/bin/bash", "-c", step!.run!], {
          cwd: directory,
          env: { ...process.env, ASSET_NAME: assetName },
        })
        expect(result.exitCode).not.toBe(0)
        expect(result.stderr.toString()).toContain("not signed at all")
        expect(result.stderr.toString()).not.toContain("unsigned-binary-ran")
        expect(readFileSync(path, "utf8")).toBe(binary)
      } finally {
        rmSync(directory, { recursive: true, force: true })
      }
    },
  )

  it("blocks publication and update notifications until artifact validation succeeds", () => {
    expect(workflow.jobs["validate-macos-artifact"]?.needs).toContain(
      "checksums",
    )
    expect(workflow.jobs.undraft.needs).toContain("validate-macos-artifact")
    expect(workflow.jobs["notify-homebrew"].needs).toContain("undraft")
    expect(workflow.jobs["publish-update-manifest"].needs).toContain("undraft")
  })

  it.skipIf(process.platform === "win32")(
    "refuses to rebuild an already published release",
    () => {
      const directory = mkdtempSync(join(tmpdir(), "noodle-published-release-"))
      try {
        const gh = join(directory, "gh")
        writeFileSync(
          gh,
          '#!/bin/sh\nif [ "$1 $2" = "release view" ]; then echo false; else echo unexpected-release-write >&2; exit 1; fi\n',
        )
        chmodSync(gh, 0o755)
        const step = workflow.jobs["create-release"].steps!.find(
          (step) => step.name === "Create draft release",
        )!
        const result = Bun.spawnSync(["bash", "-c", step.run!], {
          cwd: directory,
          env: {
            ...process.env,
            PATH: `${directory}:${process.env.PATH}`,
            TAG: "v0.9.1",
          },
        })
        expect(result.exitCode).not.toBe(0)
        expect(result.stderr.toString()).toContain(
          "Refusing to replace assets of published release v0.9.1",
        )
        expect(result.stderr.toString()).not.toContain(
          "unexpected-release-write",
        )
      } finally {
        rmSync(directory, { recursive: true, force: true })
      }
    },
  )
})
