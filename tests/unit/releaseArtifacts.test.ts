import { describe, expect, it } from "bun:test"
import { createHash } from "node:crypto"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  buildManifest,
  recordArtifact,
  releaseTargets,
  resolveCI,
  updateManifest,
  verifyArtifacts,
  verifyPublished,
} from "../../scripts/release-artifacts"

const sha = "a".repeat(40)
const repo = "wilfredinni/noodle"
const run = {
  id: 123,
  head_sha: sha,
  head_branch: "main",
  event: "push",
  path: ".github/workflows/ci.yml",
  status: "completed",
  conclusion: "success",
  repository: { full_name: repo },
  head_repository: { full_name: repo },
}
const artifacts = releaseTargets.map(({ asset }, index) => ({
  id: index + 1,
  name: `validated-${asset}`,
  size_in_bytes: 100,
  expired: false,
}))

describe("release CI selection", () => {
  it("reuses only successful push CI for the exact main commit and repository", async () => {
    const result = await resolveCI(repo, sha, async (path) =>
      path.includes("/artifacts?")
        ? [{ artifacts }]
        : [{ workflow_runs: [run] }],
    )
    expect(result).toMatchObject({
      reuse: true,
      runId: "123",
      artifactIds: "1,2,3,4,5",
    })
  })
  it.each([
    {},
    { head_sha: "b".repeat(40) },
    { event: "pull_request" },
    { head_branch: "feature" },
    { path: ".github/workflows/other.yml" },
    { repository: { full_name: "other/noodle" } },
    { head_repository: { full_name: "fork/noodle" } },
  ])("falls back when no qualifying push CI exists: %j", async (change) => {
    const runs = Object.keys(change).length ? [{ ...run, ...change }] : []
    expect(
      await resolveCI(repo, sha, async () => [{ workflow_runs: runs }]),
    ).toMatchObject({ reuse: false })
  })
  it.each(["failure", "cancelled", "timed_out", "skipped"])(
    "blocks %s CI instead of rebuilding",
    async (conclusion) => {
      await expect(
        resolveCI(repo, sha, async () => [
          { workflow_runs: [{ ...run, id: 124, conclusion }, run] },
        ]),
      ).rejects.toThrow(conclusion)
    },
  )
  it("waits for pending CI at fifteen-second intervals", async () => {
    let reads = 0
    const waits: number[] = []
    const result = await resolveCI(
      repo,
      sha,
      async (path) => {
        if (path.includes("/artifacts?")) return [{ artifacts }]
        if (path.includes("/runs?"))
          return [
            { workflow_runs: [{ ...run, status: "queued", conclusion: null }] },
          ]
        return [{ ...run, status: ++reads === 1 ? "in_progress" : "completed" }]
      },
      async (ms) => {
        waits.push(Number(ms))
      },
    )
    expect(result.reuse).toBe(true)
    expect(waits).toEqual([15_000, 15_000])
  })
  it("blocks pending CI that fails, changes identity, or exceeds fifteen minutes", async () => {
    for (const outcome of ["failure", "cancelled", "changed", "timeout"]) {
      let time = 0
      const api = async (path: string) =>
        path.includes("/runs?")
          ? [{ workflow_runs: [{ ...run, status: "in_progress" }] }]
          : [
              {
                ...run,
                status: outcome === "timeout" ? "in_progress" : "completed",
                conclusion: outcome,
                head_sha: outcome === "changed" ? "b".repeat(40) : sha,
              },
            ]
      await expect(
        resolveCI(
          repo,
          sha,
          api,
          async () => {
            time += 15_000
          },
          () => time,
        ),
      ).rejects.toThrow()
      if (outcome === "timeout") expect(time).toBe(900_000)
    }
  })
  it("blocks API failures and malformed responses", async () => {
    await expect(
      resolveCI(repo, sha, async () => {
        throw new Error("API unavailable")
      }),
    ).rejects.toThrow("API unavailable")
    await expect(resolveCI(repo, sha, async () => [{}])).rejects.toThrow(
      "Invalid workflow",
    )
    await expect(
      resolveCI(repo, sha, async (path) =>
        path.includes("/artifacts?") ? [{}] : [{ workflow_runs: [run] }],
      ),
    ).rejects.toThrow("Invalid artifacts")
  })
  it.each([null, {}, { name: 123 }])(
    "rejects malformed artifact names: %j",
    async (artifact) => {
      await expect(
        resolveCI(repo, sha, async (path) =>
          path.includes("/artifacts?")
            ? [{ artifacts: [artifact, ...artifacts] }]
            : [{ workflow_runs: [run] }],
        ),
      ).rejects.toThrow("Invalid artifacts response")
    },
  )
  it.each(["missing", "expired", "extra", "duplicate", "empty"])(
    "handles %s artifact inventories",
    async (mode) => {
      const list = artifacts.map((artifact) => ({ ...artifact }))
      if (mode === "missing") list.pop()
      if (mode === "expired") list[0].expired = true
      if (mode === "extra")
        list.push({ ...list[0], name: "validated-unexpected" })
      if (mode === "duplicate") list.push(list[0])
      if (mode === "empty") list[0].size_in_bytes = 0
      const resolve = resolveCI(repo, sha, async (path) =>
        path.includes("/artifacts?")
          ? [{ artifacts: list }]
          : [{ workflow_runs: [run] }],
      )
      if (mode === "missing" || mode === "expired")
        expect(await resolve).toMatchObject({ reuse: false })
      else await expect(resolve).rejects.toThrow()
    },
  )
})

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "noodle-validated-"))
  const directory = join(root, "artifacts")
  mkdirSync(directory)
  for (const entry of releaseTargets) {
    writeFileSync(join(root, entry.asset), entry.asset)
    recordArtifact(
      root,
      join(directory, `validated-${entry.asset}`),
      entry.target,
      sha,
      "0.9.7",
      "123",
    )
  }
  return { root, directory, output: join(root, "release-assets") }
}

describe("validated release artifacts", () => {
  it("records and verifies artifacts again in existing output directories", () => {
    const { root, directory, output } = fixture()
    try {
      const entry = releaseTargets[0]
      recordArtifact(
        root,
        join(directory, `validated-${entry.asset}`),
        entry.target,
        sha,
        "0.9.7",
        "123",
      )
      verifyArtifacts(directory, output, sha, "0.9.7", "123")
      writeFileSync(join(output, entry.asset), "stale")
      verifyArtifacts(directory, output, sha, "0.9.7", "123")
      expect(readFileSync(join(output, entry.asset), "utf8")).toBe(entry.asset)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
  it.each([
    "valid",
    "missing",
    "extra",
    "empty",
    "commit",
    "version",
    "target",
    "asset",
    "bun",
    "runId",
    "formatVersion",
    "hash",
    "metadata",
    ...(process.platform === "win32" ? [] : ["symlink", "folder-link"]),
  ])("validates the entire batch before publication: %s", (mode) => {
    const { root, directory, output } = fixture()
    try {
      const entry = releaseTargets[0]
      const folder = join(directory, `validated-${entry.asset}`)
      const binary = join(folder, entry.asset)
      const metadataPath = join(folder, "metadata.json")
      const metadata = JSON.parse(readFileSync(metadataPath, "utf8"))
      if (mode === "missing") rmSync(folder, { recursive: true })
      else if (mode === "extra") writeFileSync(join(directory, "extra"), "bad")
      else if (mode === "empty") writeFileSync(binary, "")
      else if (mode === "hash") writeFileSync(binary, "tampered")
      else if (mode === "metadata") writeFileSync(metadataPath, "invalid")
      else if (mode === "symlink") {
        rmSync(binary)
        symlinkSync(join(root, entry.asset), binary)
      } else if (mode === "folder-link") {
        rmSync(folder, { recursive: true })
        symlinkSync(root, folder)
      } else if (mode !== "valid") {
        metadata[mode] = "wrong"
        writeFileSync(metadataPath, JSON.stringify(metadata))
      }
      if (mode === "valid") {
        verifyArtifacts(directory, output, sha, "0.9.7", "123")
        for (const { asset, target } of releaseTargets) {
          expect(readFileSync(join(output, asset), "utf8")).toBe(asset)
          if (process.platform !== "win32" && target !== "win32-x64")
            expect(statSync(join(output, asset)).mode & 0o777).toBe(0o755)
        }
      } else {
        expect(() =>
          verifyArtifacts(directory, output, sha, "0.9.7", "123"),
        ).toThrow()
        expect(existsSync(output)).toBe(false)
      }
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe("release publication recovery", () => {
  it("verifies published binaries, recovers idempotently, and refuses downgrades or mutated releases", () => {
    const { root, directory, output } = fixture()
    try {
      verifyArtifacts(directory, output, sha, "0.9.7", "123")
      const native = releaseTargets.find(
        ({ target }) => target === `${process.platform}-${process.arch}`,
      )!
      const source = join(root, "version.ts")
      writeFileSync(source, 'console.log("0.9.7")')
      expect(
        Bun.spawnSync(
          [
            process.execPath,
            "build",
            "--compile",
            source,
            "--outfile",
            join(output, native.asset),
          ],
          { cwd: root },
        ).exitCode,
      ).toBe(0)
      const checksums = releaseTargets
        .map(({ asset }) => {
          const hash = createHash("sha256")
            .update(readFileSync(join(output, asset)))
            .digest("hex")
          return `${hash}  ${asset}\n`
        })
        .join("")
      writeFileSync(join(output, "SHA256SUMS"), checksums)
      verifyPublished(output, "v0.9.7")
      expect(() => verifyPublished(output, "v0.9.8")).toThrow(
        "does not report v0.9.8",
      )
      const manifest = buildManifest("v0.9.7", checksums)
      const next = join(root, "update.json")
      const current = join(root, "current.json")
      writeFileSync(next, JSON.stringify(manifest))
      updateManifest(next, current)
      expect(JSON.parse(readFileSync(current, "utf8"))).toEqual(manifest)
      writeFileSync(current, "invalid")
      expect(() => updateManifest(next, current)).toThrow("Invalid JSON")
      expect(readFileSync(current, "utf8")).toBe("invalid")
      writeFileSync(current, JSON.stringify({ ...manifest, version: "v0.9.6" }))
      updateManifest(next, current)
      updateManifest(next, current)
      expect(JSON.parse(readFileSync(current, "utf8"))).toEqual(manifest)
      writeFileSync(current, JSON.stringify({ ...manifest, version: "v0.9.8" }))
      expect(() => updateManifest(next, current)).toThrow("downgrade")
      writeFileSync(current, JSON.stringify({ ...manifest, assets: {} }))
      expect(() => updateManifest(next, current)).toThrow("different checksums")
      writeFileSync(join(output, releaseTargets[0].asset), "tampered")
      expect(() => verifyPublished(output, "v0.9.7")).toThrow(
        "checksum mismatch",
      )
      for (const invalid of [
        checksums + checksums.split("\n")[0],
        checksums.replace(/^[^\n]+\n/, ""),
        checksums.replace(/^[a-f0-9]/, "x"),
        checksums + "a".repeat(64) + "  noodle-unknown\n",
      ])
        expect(() => buildManifest("v0.9.7", invalid)).toThrow()
      expect(() => buildManifest("latest", checksums)).toThrow(
        "Invalid version",
      )
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe("release artifacts CLI validation", () => {
  it.each([
    { args: [] },
    { args: ["unknown"] },
    { args: ["record"] },
    { args: ["resolve", "unexpected"] },
    { args: ["verify", "assets"] },
    { args: ["manifest", "SHA256SUMS"] },
    { args: ["update-manifest", "next.json"] },
    { args: ["verify-published"] },
  ])("reports usage before accessing files: %j", ({ args }) => {
    const result = Bun.spawnSync([
      process.execPath,
      join(import.meta.dir, "../../scripts/release-artifacts.ts"),
      ...args,
    ])
    expect(result.exitCode).not.toBe(0)
    expect(result.stderr.toString()).toContain("Usage: release-artifacts.ts")
  })
  it.each([
    { args: ["record", "linux-x64"], missing: "GITHUB_RUN_ID" },
    { args: ["resolve"], missing: "GITHUB_OUTPUT" },
    { args: ["verify", "assets", "output"], missing: "RELEASE_SHA" },
    { args: ["manifest", "SHA256SUMS", "output"], missing: "TAG" },
    { args: ["verify-published", "assets"], missing: "TAG" },
  ])("reports missing $missing before accessing files", ({ args, missing }) => {
    const result = Bun.spawnSync(
      [
        process.execPath,
        join(import.meta.dir, "../../scripts/release-artifacts.ts"),
        ...args,
      ],
      { env: { ...process.env, [missing]: "" } },
    )
    expect(result.exitCode).not.toBe(0)
    expect(result.stderr.toString()).toContain(`Missing ${missing}`)
  })
})
