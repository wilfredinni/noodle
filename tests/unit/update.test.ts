import { describe, it, expect } from "bun:test"
import {
  getPlatformString,
  compareStableVersions,
  getAssetName,
  isNewerVersion,
  isHomebrewInstall,
  parseChecksumManifest,
  sha256,
} from "../../src/app/commands/update"

describe("getPlatformString", () => {
  it("returns macos-arm64 for darwin + arm64", () => {
    expect(getPlatformString("darwin", "arm64")).toBe("macos-arm64")
  })

  it("returns macos-x86_64 for darwin + x64", () => {
    expect(getPlatformString("darwin", "x64")).toBe("macos-x86_64")
  })

  it("returns linux-x86_64 for linux + x64", () => {
    expect(getPlatformString("linux", "x64")).toBe("linux-x86_64")
  })

  it("rejects unsupported 32-bit architectures", () => {
    expect(() => getPlatformString("linux", "ia32")).toThrow(
      "Unsupported platform",
    )
  })

  it("returns linux-arm64 for linux + arm64", () => {
    expect(getPlatformString("linux", "arm64")).toBe("linux-arm64")
  })

  it("rejects unsupported architectures", () => {
    expect(() => getPlatformString("linux", "mips")).toThrow(
      "Unsupported platform",
    )
  })

  it("rejects unsupported operating systems", () => {
    expect(() => getPlatformString("freebsd", "x64")).toThrow(
      "Unsupported platform",
    )
  })
})

describe("getAssetName", () => {
  it("includes the platform string", () => {
    expect(getAssetName("darwin", "arm64")).toBe("noodle-macos-arm64")
    expect(getAssetName("linux", "x64")).toBe("noodle-linux-x86_64")
  })
})

describe("isNewerVersion", () => {
  it("returns false when versions match", () => {
    expect(isNewerVersion("v0.1.0", "v0.1.0")).toBe(false)
  })

  it("returns true only when latest is newer", () => {
    expect(isNewerVersion("v0.1.0", "v0.2.0")).toBe(true)
    expect(isNewerVersion("v0.1.0", "v1.0.0")).toBe(true)
    expect(isNewerVersion("v0.1.0", "v0.0.9")).toBe(false)
    expect(isNewerVersion("v0.1.0", "v0.1.0-beta.1")).toBe(false)
    expect(isNewerVersion("v0.1.0", "release")).toBe(false)
  })
})

describe("compareStableVersions", () => {
  it("returns ordering for v-prefixed stable versions", () => {
    expect(compareStableVersions("v0.4.6", "v0.4.7")).toBe(1)
    expect(compareStableVersions("v0.4.7", "v0.4.6")).toBe(-1)
    expect(compareStableVersions("v0.4.6", "v0.4.6")).toBe(0)
  })

  it("returns null for malformed or prerelease tags", () => {
    expect(compareStableVersions("v0.4.6", "0.4.7")).toBeNull()
    expect(compareStableVersions("v0.4.6", "v0.4.7-beta.1")).toBeNull()
  })
})

describe("checksum helpers", () => {
  it("finds the exact asset checksum", () => {
    expect(
      parseChecksumManifest(
        "a".repeat(64) +
          "  noodle-linux-arm64\n" +
          "b".repeat(64) +
          "  noodle-linux-x86_64\n",
        "noodle-linux-x86_64",
      ),
    ).toBe("b".repeat(64))
  })

  it("rejects missing and malformed checksums", () => {
    expect(
      parseChecksumManifest(
        "not-a-checksum  noodle-linux-arm64",
        "noodle-linux-arm64",
      ),
    ).toBeNull()
    expect(
      parseChecksumManifest("a".repeat(64) + "  other", "noodle-linux-arm64"),
    ).toBeNull()
  })

  it("calculates SHA-256", () => {
    expect(sha256(new TextEncoder().encode("noodle"))).toBe(
      "49742b4b8dd3a7ff2a2a32410e34f55a57d09a2327edb26d726a30e400960966",
    )
  })
})

describe("isHomebrewInstall", () => {
  it("detects homebrew prefix", () => {
    expect(isHomebrewInstall("/opt/homebrew/bin/noodle")).toBe(true)
  })

  it("detects linuxbrew prefix", () => {
    expect(isHomebrewInstall("/home/linuxbrew/.linuxbrew/bin/noodle")).toBe(
      true,
    )
  })

  it("detects brew in path", () => {
    expect(isHomebrewInstall("/usr/local/brew/bin/noodle")).toBe(true)
  })

  it("returns false for non-brew paths", () => {
    expect(isHomebrewInstall("/home/user/.local/bin/noodle")).toBe(false)
    expect(isHomebrewInstall("/usr/local/bin/noodle")).toBe(false)
    expect(isHomebrewInstall("/tmp/noodle")).toBe(false)
  })
})
