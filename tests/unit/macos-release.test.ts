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
import { basename, join, resolve } from "node:path"
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
      if?: string
      uses?: string
      with?: Record<string, unknown>
      "timeout-minutes"?: number | string
      concurrency?: Record<string, unknown>
      permissions?: Record<string, string>
      "runs-on"?: string
      defaults?: { run?: { shell?: string } }
      env?: Record<string, string>
      strategy?: {
        matrix: {
          os?: string[]
          include: {
            os: string
            target: string
            asset: string
            shell: string
          }[]
        }
      }
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
  "windows-x86_64",
]

function releaseAsset(target: string) {
  return `noodle-${target}${target.startsWith("windows-") ? ".exe" : ""}`
}

describe("release platforms", () => {
  it.skipIf(process.platform === "win32")(
    "loads immutable workflow tools when the published tag predates them",
    () => {
      const directory = mkdtempSync(join(tmpdir(), "noodle-recovery-tools-"))
      try {
        const archive = join(directory, "tools.tar")
        expect(
          Bun.spawnSync([
            "tar",
            "-cf",
            archive,
            "-C",
            root,
            "scripts/release-artifacts.ts",
            "src/app/commands/updateManifest.ts",
            "src/app/commands/updateDetect.ts",
          ]).exitCode,
        ).toBe(0)
        writeFileSync(
          join(directory, "git"),
          '#!/bin/sh\ncase "$1" in\nfetch) printf "%s\\n" "$4" > tooling-sha ;;\narchive) cat "$TOOLING_ARCHIVE" ;;\n*) exit 1 ;;\nesac\n',
          { mode: 0o755 },
        )
        const recovery = workflow.jobs["recover-publication"].steps!.find(
          (step) =>
            step.name === "Load publication tools from the workflow commit",
        )!
        const manifest = workflow.jobs["publish-update-manifest"].steps!.find(
          (step) => step.name === recovery.name,
        )!
        expect(manifest.run).toBe(recovery.run)
        expect(
          existsSync(join(directory, "scripts/release-artifacts.ts")),
        ).toBe(false)
        const sha = "a".repeat(40)
        const result = Bun.spawnSync(["bash", "-c", recovery.run!], {
          cwd: directory,
          env: {
            ...process.env,
            PATH: `${directory}:${process.env.PATH}`,
            TOOLING_SHA: sha,
            TOOLING_ARCHIVE: archive,
          },
        })
        expect(result.exitCode).toBe(0)
        expect(
          Bun.spawnSync(["bash", "-c", recovery.run!], {
            cwd: directory,
            env: {
              ...process.env,
              PATH: `${directory}:${process.env.PATH}`,
              TOOLING_SHA: sha,
              TOOLING_ARCHIVE: archive,
            },
          }).exitCode,
        ).toBe(0)
        expect(
          readFileSync(join(directory, "tooling-sha"), "utf8").trim(),
        ).toBe(sha)
        writeFileSync(
          join(directory, "SHA256SUMS"),
          releaseTargets
            .map((target) => `${"a".repeat(64)}  ${releaseAsset(target)}\n`)
            .join(""),
        )
        const built = Bun.spawnSync(
          [
            process.execPath,
            ".release-tools/scripts/release-artifacts.ts",
            "manifest",
            "SHA256SUMS",
            "update.json",
          ],
          { cwd: directory, env: { ...process.env, TAG: "v0.9.7" } },
        )
        expect(built.exitCode).toBe(0)
        expect(
          JSON.parse(readFileSync(join(directory, "update.json"), "utf8"))
            .version,
        ).toBe("v0.9.7")
      } finally {
        rmSync(directory, { recursive: true, force: true })
      }
    },
  )
  it("reuses exact-commit CI once and limits manual runs to published-release recovery", () => {
    expect(workflow.on.workflow_dispatch).toEqual({
      inputs: {
        tag: {
          description:
            "Published release to recover (site manifest and Homebrew only)",
          required: true,
          type: "string",
        },
      },
    })
    expect(workflow.jobs.quality.if).toBe(
      "needs.resolve-ci.outputs.reuse == 'false'",
    )
    expect(workflow.jobs.quality.uses).toBe("./.github/workflows/ci.yml")
    expect(workflow.jobs.quality.with?.ref).toBe(
      "${{ needs.validate-release.outputs.sha }}",
    )
    expect(workflow.jobs["resolve-ci"].if).toBe("github.event_name == 'push'")
    expect(workflow.jobs["recover-publication"].if).toBe(
      "github.event_name == 'workflow_dispatch'",
    )
    const recovery = workflow.jobs["recover-publication"].steps!.find(
      (step) => step.name === "Verify published release for recovery",
    )!.run!
    expect(recovery).toContain(".isDraft == false and .isPrerelease == false")
    expect(recovery).toContain("verify-published published-assets")
    expect(recovery).not.toContain("upload")
    expect(recovery).not.toContain("bun build")
    expect(workflow.jobs["publication-ready"].if).toContain(
      "needs.undraft.result == 'success' || needs.recover-publication.result == 'success'",
    )
    expect(workflow.jobs["publish-update-manifest"].concurrency).toEqual({
      group: "noodle-update-manifest",
      "cancel-in-progress": false,
      queue: "max",
    })
    for (const name of ["checksums", "undraft"])
      expect(
        workflow.jobs[name].steps!.some((step) =>
          step.run?.includes("FETCH_HEAD^{commit}"),
        ),
      ).toBe(true)
    for (const [name, job] of Object.entries(workflow.jobs)) {
      if (name === "validate-release") continue
      for (const step of job.steps ?? []) {
        if (
          step.uses?.startsWith("actions/checkout@") &&
          !step.with?.repository
        )
          expect(step.with?.ref).toBe(
            "${{ needs.validate-release.outputs.sha }}",
          )
      }
    }
    expect(ci.jobs["test-windows"]["timeout-minutes"]).toBe(30)
    expect(ci.jobs["platform-checks"]["timeout-minutes"]).toBe(
      "${{ matrix.os == 'windows-latest' && 30 || 10 }}",
    )
    expect(
      ci.jobs["test-windows"].steps!.filter((step) =>
        step.run?.startsWith("bun test"),
      ),
    ).toHaveLength(1)
    expect(
      ci.jobs.test.steps!.filter((step) => step.run === "bun test"),
    ).toHaveLength(1)
    for (const job of Object.values(ci.jobs))
      for (const step of job.steps ?? [])
        expect(step.run ?? "").not.toMatch(/--rerun-each|--parallel/)
  })
  it("tests response downloads against the exact release binary before upload", () => {
    const steps = ci.jobs["platform-checks"].steps!
    const smoke = steps.findIndex(
      (step) => step.name === "Test Unix standalone executable",
    )
    const upload = steps.findIndex(
      (step) => step.name === "Upload validated binary",
    )
    expect(smoke).toBeGreaterThanOrEqual(0)
    expect(smoke).toBeLessThan(upload)
    expect(steps[smoke]!.run).toContain(
      'NOODLE_TEST_BINARY="$PWD/$ASSET_NAME" bun test tests/integration/binaryResponse.test.ts --timeout=30000',
    )
  })
  it.each([["CI", ci.jobs["platform-checks"]]] as const)(
    "%s builds reject stale generated artifacts and avoid shared dependency caches",
    (_name, job) => {
      const steps = job.steps!
      expect(steps.some((step) => step.uses?.startsWith("actions/cache"))).toBe(
        false,
      )
      const install = steps.findIndex(
        (step) => step.run === "bun install --frozen-lockfile",
      )
      const compile = steps.findIndex((step) =>
        step.run?.includes("bun build --compile"),
      )
      expect(install).toBeGreaterThanOrEqual(0)
      expect(compile).toBeGreaterThan(install)
      for (const command of [
        "bun run script:check",
        "bun scripts/build-schema-validator.ts --check",
        "bun scripts/build-script-type-libraries.ts --check",
      ]) {
        const check = steps.findIndex((step) =>
          step.run?.split(" && ").includes(command),
        )
        expect(check).toBeGreaterThan(install)
        expect(check).toBeLessThan(compile)
      }
    },
  )

  it("keeps tag publication and read-only builds with rerunnable artifact transfers", () => {
    expect(workflow.on.push).toEqual({ tags: ["v*"] })
    expect(workflow.concurrency["cancel-in-progress"]).toBe(false)
    expect(workflow.permissions).toEqual({ contents: "read" })
    expect(workflow.jobs.build).toBeUndefined()
    expect(workflow.jobs["resolve-ci"].permissions).toEqual({
      contents: "read",
      actions: "read",
    })
    expect(workflow.jobs["validate-release-artifact"].permissions).toEqual({
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
    const upload = ci.jobs["platform-checks"].steps!.find((step) =>
      step.uses?.startsWith("actions/upload-artifact@"),
    )!
    expect(upload.with).toMatchObject({
      name: "validated-${{ matrix.asset }}",
      path: "validated-build/*",
      "retention-days": 7,
      "if-no-files-found": "error",
      overwrite: true,
    })
    expect(
      ci.jobs["platform-checks"].steps!.some((step) =>
        step.run?.includes("gh release"),
      ),
    ).toBe(false)
    const download = workflow.jobs.checksums.steps!.find((step) =>
      step.uses?.startsWith("actions/download-artifact@"),
    )!
    expect(download.with).toEqual({
      "github-token": "${{ github.token }}",
      "run-id": "${{ needs.resolve-ci.outputs.run-id }}",
      "artifact-ids": "${{ needs.resolve-ci.outputs.artifact-ids }}",
      pattern: "validated-*",
      path: "validated-assets",
      "merge-multiple": false,
      "digest-mismatch": "error",
    })
    expect(workflow.jobs.checksums.needs).toContain("quality")
  })

  it("tests and builds five platforms and validates macOS and Windows release artifacts", () => {
    const builds = ci.jobs["platform-checks"].strategy!.matrix.include.map(
      (entry) => ({
        ...entry,
        target: entry.target
          .replace(/^darwin-/, "macos-")
          .replace(/^win32-/, "windows-")
          .replace(/-x64$/, "-x86_64"),
      }),
    )
    expect(builds.map(({ os, target }) => ({ os, target }))).toEqual([
      { os: "macos-15", target: "macos-arm64" },
      { os: "macos-15-intel", target: "macos-x86_64" },
      { os: "ubuntu-24.04-arm", target: "linux-arm64" },
      { os: "ubuntu-latest", target: "linux-x86_64" },
      { os: "windows-latest", target: "windows-x86_64" },
    ])
    expect(
      ci.jobs["platform-checks"].strategy!.matrix.include.map(
        ({ os, target }) => ({
          os,
          target: target
            .replace(/^darwin-/, "macos-")
            .replace(/^win32-/, "windows-")
            .replace(/-x64$/, "-x86_64"),
        }),
      ),
    ).toEqual(
      expect.arrayContaining(builds.map(({ os, target }) => ({ os, target }))),
    )
    expect(ci.jobs["platform-checks"].strategy!.matrix.include).toHaveLength(5)
    const validation = workflow.jobs["validate-release-artifact"]
    expect(validation.strategy!.matrix.include).toEqual(
      builds.filter(
        ({ target }) =>
          target.startsWith("macos-") || target.startsWith("windows-"),
      ),
    )
    for (const job of [ci.jobs["platform-checks"], validation]) {
      expect(job["runs-on"]).toBe("${{ matrix.os }}")
    }
    expect(validation.env?.ASSET_NAME).toBe("${{ matrix.asset }}")
    for (const build of builds) {
      expect(build.asset).toBe(releaseAsset(build.target))
      expect(build.shell).toBe(
        build.target.startsWith("windows-") ? "pwsh" : "bash",
      )
    }
  })

  it.skipIf(process.platform === "win32").each([
    { scenario: "complete", targets: releaseTargets, valid: true },
    {
      scenario: "missing Intel Mac",
      targets: releaseTargets.filter((target) => target !== "macos-x86_64"),
      valid: false,
    },
    {
      scenario: "missing Windows",
      targets: releaseTargets.filter((target) => target !== "windows-x86_64"),
      valid: false,
    },
    {
      scenario: "empty Windows binary",
      targets: releaseTargets,
      valid: false,
      empty: "windows-x86_64",
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
            join(fixtures, releaseAsset(target)),
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
          return Bun.spawnSync(
            [
              "bash",
              "-c",
              step.run!.replace(
                /bun (?:\.release-tools\/)?scripts\/release-artifacts\.ts/,
                `bun "${join(root, "scripts/release-artifacts.ts")}"`,
              ),
            ],
            {
              cwd: directory,
              env: {
                ...process.env,
                PATH: `${directory}:${process.env.PATH}`,
                TAG: "v0.9.1",
                DRAFT: draft,
              },
            },
          )
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
            .map((target) => `release-assets/${releaseAsset(target)}`)
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
              (target) =>
                `${expectedAssets[target].sha256}  ${releaseAsset(target)}`,
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

        for (const target of ["macos-x86_64", "windows-x86_64"]) {
          writeFileSync(
            join(directory, "SHA256SUMS"),
            checksums
              .split("\n")
              .filter((line) => !line.endsWith(releaseAsset(target)))
              .join("\n"),
          )
          const missing = runStep(
            "publish-update-manifest",
            "Build update manifest",
          )
          expect(missing.exitCode).not.toBe(0)
          expect(missing.stderr.toString()).toContain(
            `Missing ${target} checksum`,
          )
        }
      } finally {
        rmSync(directory, { recursive: true, force: true })
      }
    },
  )
})

describe("manual CI builds", () => {
  it("validates Windows in the shared matrix without automatic stress repetitions", () => {
    const job = ci.jobs["platform-checks"]
    expect(ci.jobs["windows-x64"]).toBeUndefined()
    expect(
      job.strategy!.matrix.include.find(({ target }) => target === "win32-x64"),
    ).toEqual({
      os: "windows-latest",
      target: "win32-x64",
      asset: "noodle-windows-x86_64.exe",
      shell: "pwsh",
    })
    expect(job.defaults?.run?.shell).toBe("${{ matrix.shell }}")
    const suite = ci.jobs["test-windows"].steps!.find(
      (step) => step.name === "Run complete applicable Windows suite",
    )!
    expect(suite.run).toBe("bun test --timeout=30000")
    expect(suite.if).toBeUndefined()
    expect(
      job.steps!.some((step) => step.run === "bun test --timeout=30000"),
    ).toBe(false)
    expect(ci.jobs["test-windows"]["runs-on"]).toBe("windows-latest")
    expect(job.steps!.some((step) => step.run?.includes("--rerun-each"))).toBe(
      false,
    )
    expect(
      job.steps!.find(
        (step) => step.name === "Test native Windows Credential Manager",
      )?.if,
    ).toBe("runner.os == 'Windows'")
    const compile = job.steps!.find((step) =>
      step.run?.startsWith("bun build --compile"),
    )!.run!
    expect(compile).toContain("--entry-naming '[name].[ext]'")
    expect(compile).toContain("src/ui/editor/scriptDiagnostics.worker.ts")
    expect(compile).toContain('--outfile "${{ matrix.asset }}"')
    const packageStep = job.steps!.find(
      (step) => step.name === "Package Windows beta test build",
    )!
    expect(packageStep.if).toBe(
      "github.event_name == 'workflow_dispatch' && runner.os == 'Windows'",
    )
    for (const file of ["noodle.exe", "SHA256SUMS", "BUILD_INFO.txt"])
      expect(packageStep.run).toContain(file)
    expect(packageStep.run).toContain("Get-FileHash")
    expect(packageStep.run).toContain("Compress-Archive")
    expect(packageStep.run).toContain("support=beta")
    expect(job.strategy!.matrix.include).toHaveLength(5)
  })

  it("isolates PR cancellation and only uploads explicitly dispatched test builds", () => {
    expect(ci.on).toHaveProperty("workflow_dispatch")
    expect(ci.on).toHaveProperty("workflow_call")
    expect(ci.concurrency).toEqual({
      group:
        "ci-${{ github.workflow }}-${{ github.event.pull_request.number || github.run_id }}",
      "cancel-in-progress": "${{ github.event_name == 'pull_request' }}",
    })
    const steps = ci.jobs["platform-checks"].steps!
    const compile = steps.find(
      (step) => step.name === "Test Unix standalone executable",
    )!.run!
    expect(compile).toContain(
      'bun scripts/compiled-script-smoke.ts "./$ASSET_NAME"',
    )
    expect(compile).toContain('"./$ASSET_NAME" --version')
    expect(
      steps.findIndex((step) => step.name === "Sign and verify macOS binary"),
    ).toBeLessThan(
      steps.findIndex(
        (step) => step.name === "Test Unix standalone executable",
      ),
    )
    for (const name of ["Upload test build", "Link test build"]) {
      expect(steps.find((step) => step.name === name)!.if).toBe(
        "github.event_name == 'workflow_dispatch'",
      )
    }
    expect(
      steps.find((step) => step.name === "Upload test build")!.with,
    ).toMatchObject({
      path: "${{ runner.os == 'Windows' && 'noodle-test-windows-x64-beta.zip' || format('noodle-test-{0}.tar.gz', matrix.target) }}",
      archive: false,
      "if-no-files-found": "error",
      overwrite: true,
      "retention-days": 7,
    })
    expect(
      steps.findIndex((step) => step.name === "Package Unix test build"),
    ).toBeGreaterThan(
      steps.findIndex(
        (step) => step.name === "Test independently rebuilt native downloads",
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
          "noodle-macos-arm64": binary,
          git: `#!/bin/sh\necho ${commit}\n`,
          bun: "#!/bin/sh\necho 1.4.0\n",
        })) {
          writeFileSync(join(directory, file), content, { mode: 0o755 })
        }
        const step = ci.jobs["platform-checks"].steps!.find(
          (step) => step.name === "Package Unix test build",
        )!
        const packed = Bun.spawnSync(
          [
            "bash",
            "-c",
            step.run!.replace(
              /bun (?:\.release-tools\/)?scripts\/release-artifacts\.ts/,
              `bun "${join(root, "scripts/release-artifacts.ts")}"`,
            ),
          ],
          {
            cwd: directory,
            env: {
              ...process.env,
              PATH: `${directory}:${process.env.PATH}`,
              TARGET: "darwin-arm64",
              ASSET_NAME: "noodle-macos-arm64",
            },
          },
        )
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

describe("Windows release validation", () => {
  it.skipIf(process.platform !== "win32").each([
    { scenario: "verified executable", mode: "valid" },
    { scenario: "checksum mismatch", mode: "bad_hash" },
    { scenario: "missing checksum", mode: "missing" },
    { scenario: "duplicate checksum", mode: "duplicate" },
    { scenario: "unexpected version", mode: "version" },
    { scenario: "failed scripting smoke", mode: "smoke" },
    { scenario: "failed native download test", mode: "native" },
  ])("checks the downloaded Windows release: $scenario", ({ mode }) => {
    const directory = mkdtempSync(
      join(tmpdir(), "noodle windows release café-"),
    )
    try {
      const assets = join(directory, "release-assets")
      mkdirSync(assets)
      const asset = "noodle-windows-x86_64.exe"
      const binary = join(assets, asset)
      const invalidChecksum = ["bad_hash", "missing", "duplicate"].includes(
        mode,
      )
      if (invalidChecksum) writeFileSync(binary, "This file must never execute")
      else copyFileSync(process.execPath, binary)
      const hash = createHash("sha256")
        .update(readFileSync(binary))
        .digest("hex")
      const checksum = `${mode === "bad_hash" ? "0".repeat(64) : hash}  ${asset}\n`
      writeFileSync(
        join(assets, "SHA256SUMS"),
        mode === "missing"
          ? ""
          : mode === "duplicate"
            ? checksum + checksum
            : checksum,
      )
      writeFileSync(
        join(directory, "package.json"),
        JSON.stringify({ version: mode === "version" ? "0.0.0" : Bun.version }),
      )
      const calls = join(directory, "calls")
      const step = workflow.jobs["validate-release-artifact"].steps!.find(
        (step) => step.name === "Verify downloaded Windows binary",
      )!
      const script = join(directory, "validate.ps1")
      writeFileSync(
        script,
        `
$ErrorActionPreference = "Stop"
function bun {
  [IO.File]::AppendAllText($env:NOODLE_TEST_CALLS, "$args" + [Environment]::NewLine)
  if ($args[0] -eq "scripts/compiled-script-smoke.ts" -and $env:NOODLE_TEST_FAIL -eq "smoke") {
    $global:LASTEXITCODE = 17
  } elseif ($args[0] -eq "test" -and $env:NOODLE_TEST_FAIL -eq "native") {
    $global:LASTEXITCODE = 18
  } else {
    $global:LASTEXITCODE = 0
  }
}
${step.run}
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
`,
      )
      const result = Bun.spawnSync(
        [
          "pwsh",
          "-NoProfile",
          "-NonInteractive",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          script,
        ],
        {
          cwd: directory,
          env: {
            ...process.env,
            ASSET_NAME: asset,
            NOODLE_TEST_CALLS: calls,
            NOODLE_TEST_FAIL: mode,
          },
        },
      )
      const output = result.stdout.toString() + result.stderr.toString()
      expect(result.exitCode, output).toBe(
        mode === "valid"
          ? 0
          : mode === "smoke"
            ? 17
            : mode === "native"
              ? 18
              : 1,
      )
      const invoked = existsSync(calls)
        ? readFileSync(calls, "utf8").trim().split(/\r?\n/)
        : []
      if (mode === "valid" || mode === "native") {
        expect(invoked).toHaveLength(2)
        expect(invoked[0]).toContain("scripts/compiled-script-smoke.ts")
        const smokeBinary = invoked[0]!.slice(
          "scripts/compiled-script-smoke.ts ".length,
        )
        expect(basename(smokeBinary)).toBe(asset)
        expect(
          createHash("sha256").update(readFileSync(smokeBinary)).digest("hex"),
        ).toBe(hash)
        expect(invoked[1]).toContain("tests/integration/binaryResponse.test.ts")
      } else if (mode === "smoke") {
        expect(invoked).toHaveLength(1)
      } else {
        expect(invoked).toEqual([])
        expect(output).toContain(
          mode === "bad_hash"
            ? "Downloaded Windows release checksum mismatch"
            : mode === "version"
              ? "Downloaded binary reported"
              : "Missing or invalid Windows release checksum",
        )
      }
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
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
        const step = workflow.jobs["validate-release-artifact"]?.steps?.find(
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
    expect(workflow.jobs["validate-release-artifact"]?.needs).toContain(
      "checksums",
    )
    expect(workflow.jobs.undraft.needs).toContain("validate-release-artifact")
    expect(workflow.jobs["notify-homebrew"].needs).toContain(
      "publication-ready",
    )
    expect(workflow.jobs["publish-update-manifest"].needs).toContain(
      "publication-ready",
    )
    expect(workflow.jobs["recover-publication"].strategy?.matrix.os).toEqual([
      "macos-15",
      "macos-15-intel",
      "ubuntu-24.04-arm",
      "ubuntu-latest",
      "windows-latest",
    ])
    expect(workflow.jobs["recover-publication"].defaults?.run?.shell).toBe(
      "bash",
    )
  })

  it
    .skipIf(process.platform === "win32")
    .each([
      "missing manifest",
      "concurrent site edit",
      "concurrent newer manifest",
    ])("publishes safely with %s", (scenario) => {
    const directory = mkdtempSync(join(tmpdir(), "noodle-manifest-push-"))
    const git = (cwd: string, ...args: string[]) => {
      const result = Bun.spawnSync(["git", ...args], { cwd })
      expect(result.exitCode).toBe(0)
      return result.stdout.toString().trim()
    }
    try {
      const remote = join(directory, "remote.git")
      const site = join(directory, "noodle-site")
      const writer = join(directory, "writer")
      const realGit = Bun.which("git")!
      const manifest = (version: string) =>
        JSON.stringify({
          version,
          assets: Object.fromEntries(
            releaseTargets.map((target) => [
              target,
              { sha256: "a".repeat(64) },
            ]),
          ),
        })
      git(directory, "init", "--bare", "--initial-branch=main", remote)
      git(directory, "clone", remote, site)
      git(site, "config", "user.name", "test")
      git(site, "config", "user.email", "test@example.com")
      mkdirSync(join(site, "public"))
      writeFileSync(join(site, "public/keep.txt"), "original")
      if (scenario !== "missing manifest")
        writeFileSync(join(site, "public/update.json"), manifest("v0.9.6"))
      git(site, "add", ".")
      git(site, "commit", "-m", "test: initialize site")
      git(site, "push", "origin", "main")
      git(directory, "clone", remote, writer)
      git(writer, "config", "user.name", "test")
      git(writer, "config", "user.email", "test@example.com")
      writeFileSync(join(directory, "update.json"), manifest("v0.9.7"))
      if (scenario !== "missing manifest") {
        writeFileSync(join(writer, "public/keep.txt"), "concurrent")
        if (scenario === "concurrent newer manifest")
          writeFileSync(join(writer, "public/update.json"), manifest("v0.9.8"))
        git(writer, "add", ".")
        git(writer, "commit", "-m", "test: advance site")
        const bin = join(directory, "bin")
        mkdirSync(bin)
        writeFileSync(
          join(bin, "git"),
          '#!/bin/bash\nif [ "$1" = push ] && [ ! -e "$RACE_MARKER" ]; then\n  touch "$RACE_MARKER"\n  "$REAL_GIT" -C "$WRITER" push origin main || exit 1\nfi\nexec "$REAL_GIT" "$@"\n',
          { mode: 0o755 },
        )
      }
      const step = workflow.jobs["publish-update-manifest"].steps!.find(
        (step) => step.name === "Publish update manifest",
      )!
      const result = Bun.spawnSync(
        [
          "bash",
          "-c",
          step.run!.replace(
            "bun ../.release-tools/scripts/release-artifacts.ts",
            `bun "${join(root, "scripts/release-artifacts.ts")}"`,
          ),
        ],
        {
          cwd: directory,
          env: {
            ...process.env,
            TAG: "v0.9.7",
            PATH: `${join(directory, "bin")}:${process.env.PATH}`,
            REAL_GIT: realGit,
            WRITER: writer,
            RACE_MARKER: join(directory, "raced"),
          },
        },
      )
      const newer = scenario === "concurrent newer manifest"
      expect(result.exitCode === 0).toBe(!newer)
      if (newer) expect(result.stderr.toString()).toContain("downgrade")
      const published = JSON.parse(
        git(directory, "--git-dir", remote, "show", "main:public/update.json"),
      )
      expect(published.version).toBe(newer ? "v0.9.8" : "v0.9.7")
      expect(
        git(directory, "--git-dir", remote, "show", "main:public/keep.txt"),
      ).toBe(scenario === "missing manifest" ? "original" : "concurrent")
      expect(published.assets).toEqual(JSON.parse(manifest("v0.9.7")).assets)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
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
        const result = Bun.spawnSync(
          [
            "bash",
            "-c",
            step.run!.replace(
              /bun (?:\.release-tools\/)?scripts\/release-artifacts\.ts/,
              `bun "${join(root, "scripts/release-artifacts.ts")}"`,
            ),
          ],
          {
            cwd: directory,
            env: {
              ...process.env,
              PATH: `${directory}:${process.env.PATH}`,
              TAG: "v0.9.1",
            },
          },
        )
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
