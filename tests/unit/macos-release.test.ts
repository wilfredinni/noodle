import { describe, expect, it } from "bun:test"
import { createHash } from "node:crypto"
import {
  chmodSync,
  copyFileSync,
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
const validationScript = join(root, "scripts/validate-release-artifact.ts")
const workflow = load(
  readFileSync(join(root, ".github/workflows/release.yml"), "utf8"),
) as {
  jobs: Record<
    string,
    { needs?: string[]; steps?: { name?: string; run?: string }[] }
  >
}

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

  it.skipIf(process.platform !== "darwin")(
    "rejects a downloaded artifact with a matching checksum but an invalid signature",
    () => {
      const directory = mkdtempSync(join(tmpdir(), "noodle-release-gate-"))
      try {
        const assets = join(directory, "release-assets")
        mkdirSync(assets)
        const binary = "#!/bin/sh\necho unsigned-binary-ran >&2\n"
        const path = join(assets, "noodle-macos-arm64")
        writeFileSync(path, binary)
        chmodSync(path, 0o755)
        const hash = createHash("sha256").update(binary).digest("hex")
        writeFileSync(
          join(assets, "SHA256SUMS"),
          `${hash}  noodle-macos-arm64\n`,
        )
        const result = Bun.spawnSync([process.execPath, validationScript, path])
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
    expect(workflow.jobs["validate-artifact"]?.needs).toContain("checksums")
    expect(workflow.jobs.undraft.needs).toContain("validate-artifact")
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
