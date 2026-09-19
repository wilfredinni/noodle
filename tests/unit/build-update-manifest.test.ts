import { describe, expect, it } from "bun:test"
import { buildUpdateManifest } from "../../scripts/build-update-manifest"

const artifacts = [
  "noodle-linux-arm64",
  "noodle-linux-x86_64",
  "noodle-macos-arm64",
  "noodle-macos-x86_64",
  "noodle-windows-arm64.exe",
  "noodle-windows-x86_64.exe",
]

function checksums(overrides: Record<string, string> = {}): string {
  return artifacts
    .map(
      (name, index) =>
        `${overrides[name] ?? String(index + 1).repeat(64)}  ${name}`,
    )
    .join("\n")
}

function manifest(
  version: string,
  assets: Record<string, { sha256: string }> = {
    "linux-arm64": { sha256: "a".repeat(64) },
  },
): string {
  return JSON.stringify({ version, assets })
}

describe("buildUpdateManifest", () => {
  it("writes all official assets for a newer release", () => {
    const result = buildUpdateManifest(
      "v0.9.2",
      checksums(),
      manifest("v0.9.1"),
    )

    expect(result.status).toBe("updated")
    const generated = JSON.parse(result.contents!)
    expect(generated.version).toBe("v0.9.2")
    expect(Object.keys(generated.assets)).toEqual([
      "linux-arm64",
      "linux-x86_64",
      "macos-arm64",
      "macos-x86_64",
      "windows-arm64",
      "windows-x86_64",
    ])
    expect(generated.assets["windows-arm64"].sha256).toBe("5".repeat(64))
    expect(generated.assets["windows-x86_64"].sha256).toBe("6".repeat(64))
  })

  it("does not replace a newer manifest", () => {
    expect(
      buildUpdateManifest("v0.9.1", checksums(), manifest("v0.9.2")),
    ).toEqual({ status: "newer_exists" })
  })

  it("accepts an identical manifest as an idempotent retry", () => {
    const first = buildUpdateManifest("v0.9.2", checksums(), manifest("v0.9.1"))
    expect(buildUpdateManifest("v0.9.2", checksums(), first.contents!)).toEqual(
      { status: "current" },
    )
  })

  it("rejects different contents for the same version", () => {
    expect(() =>
      buildUpdateManifest("v0.9.1", checksums(), manifest("v0.9.1")),
    ).toThrow("Manifest v0.9.1 does not match its published checksums")
  })

  it("rejects invalid manifests and versions", () => {
    expect(() => buildUpdateManifest("v0.9.2", checksums(), "null")).toThrow(
      "Update manifest must be a JSON object",
    )
    expect(() =>
      buildUpdateManifest("0.9.2", checksums(), manifest("v0.9.1")),
    ).toThrow("Invalid version in update manifest: 0.9.2")
  })

  it("rejects invalid, duplicate, missing, and unexpected checksums", () => {
    expect(() =>
      buildUpdateManifest("v0.9.2", "not a checksum", manifest("v0.9.1")),
    ).toThrow("Invalid SHA256SUMS line: not a checksum")
    expect(() =>
      buildUpdateManifest(
        "v0.9.2",
        `${checksums()}\n${"a".repeat(64)}  noodle-linux-arm64`,
        manifest("v0.9.1"),
      ),
    ).toThrow("Duplicate checksum for noodle-linux-arm64")
    expect(() =>
      buildUpdateManifest(
        "v0.9.2",
        checksums().split("\n").slice(1).join("\n"),
        manifest("v0.9.1"),
      ),
    ).toThrow("Missing checksum for noodle-linux-arm64")
    expect(() =>
      buildUpdateManifest(
        "v0.9.2",
        `${checksums()}\n${"a".repeat(64)}  noodle-freebsd-x86_64`,
        manifest("v0.9.1"),
      ),
    ).toThrow(
      "Unexpected release artifact in SHA256SUMS: noodle-freebsd-x86_64",
    )
  })
})
