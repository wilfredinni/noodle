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
      permissions?: Record<string, string>
      "runs-on"?: string
      defaults?: { run?: { shell?: string } }
      env?: Record<string, string>
      strategy?: {
        matrix: {
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
  it("tests response downloads against the exact release binary before upload", () => {
    const steps = workflow.jobs.build.steps!
    const smoke = steps.findIndex(
      (step) => step.name === "Smoke test compiled binary",
    )
    const upload = steps.findIndex(
      (step) => step.name === "Upload build artifact",
    )
    expect(smoke).toBeGreaterThanOrEqual(0)
    expect(smoke).toBeLessThan(upload)
    expect(steps[smoke]!.run).toContain(
      'NOODLE_TEST_BINARY="$PWD/$ASSET_NAME" bun test tests/integration/binaryResponse.test.ts --timeout=30000',
    )
  })
  it.each([
    ["release", workflow.jobs.build],
    ["CI", ci.jobs["platform-checks"]],
  ] as const)(
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
    expect(workflow.jobs.build.permissions).toEqual({ contents: "read" })
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
    const upload = workflow.jobs.build.steps!.find((step) =>
      step.uses?.startsWith("actions/upload-artifact@"),
    )!
    expect(upload.with).toMatchObject({
      name: "release-${{ matrix.target }}",
      path: "${{ matrix.asset }}",
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

  it("tests and builds five platforms and validates macOS and Windows release artifacts", () => {
    const builds = workflow.jobs.build.strategy!.matrix.include
    expect(builds.map(({ os, target }) => ({ os, target }))).toEqual([
      { os: "macos-15", target: "macos-arm64" },
      { os: "macos-15-intel", target: "macos-x86_64" },
      { os: "ubuntu-latest", target: "linux-x86_64" },
      { os: "ubuntu-24.04-arm", target: "linux-arm64" },
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
    for (const job of [
      ci.jobs["platform-checks"],
      workflow.jobs.build,
      validation,
    ]) {
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
    const suite = job.steps!.find(
      (step) => step.name === "Run complete applicable Windows suite",
    )!
    expect(suite.run).toBe("bun test --timeout=30000")
    expect(suite.if).toBe("runner.os == 'Windows'")
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
    expect(workflow.jobs.build.strategy!.matrix.include).toHaveLength(5)
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
        const packed = Bun.spawnSync(["bash", "-c", step.run!], {
          cwd: directory,
          env: {
            ...process.env,
            PATH: `${directory}:${process.env.PATH}`,
            TARGET: "darwin-arm64",
            ASSET_NAME: "noodle-macos-arm64",
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
