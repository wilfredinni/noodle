import { describe, expect, it } from "bun:test"
import { createHash } from "node:crypto"
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { load } from "js-yaml"

const root = resolve(import.meta.dir, "../..")
const signingScript = join(root, "scripts/sign-macos-binary.ts")
type Workflow = {
  jobs: Record<
    string,
    {
      needs?: string[]
      "runs-on"?: string
      env?: Record<string, string>
      strategy?: { matrix: { include: { os: string; target: string }[] } }
      steps?: { name?: string; run?: string }[]
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
  ])(
    "checks release assets and update metadata: $scenario",
    ({ targets, valid }) => {
      const directory = mkdtempSync(join(tmpdir(), "noodle-release-assets-"))
      try {
        const fixtures = join(directory, "fixtures")
        mkdirSync(fixtures)
        for (const target of targets) {
          writeFileSync(join(fixtures, `noodle-${target}`), target)
        }
        const gh = join(directory, "gh")
        writeFileSync(
          gh,
          '#!/bin/sh\ncase "$1 $2" in\n"release download") cp fixtures/noodle-* release-assets/ ;;\n"release upload") touch uploaded ;;\n*) exit 1 ;;\nesac\n',
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
            },
          })
        }
        expect(runStep("checksums", "Download release binaries").exitCode).toBe(
          targets.length === 4 ? 0 : 1,
        )
        expect(
          runStep("checksums", "Generate checksums and upload").exitCode,
        ).toBe(valid ? 0 : 1)
        expect(existsSync(join(directory, "uploaded"))).toBe(valid)
        if (!valid) return

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
