import { describe, it, expect } from "bun:test"
import {
  getPlatformString,
  getAssetName,
  isNewerVersion,
  isHomebrewInstall,
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

  it("returns linux-x86_64 for linux + ia32", () => {
    expect(getPlatformString("linux", "ia32")).toBe("linux-x86_64")
  })

  it("returns linux-arm64 for linux + arm64", () => {
    expect(getPlatformString("linux", "arm64")).toBe("linux-arm64")
  })

  it("maps unknown architectures to x86_64", () => {
    expect(getPlatformString("linux", "mips")).toBe("linux-x86_64")
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

  it("returns true when latest is different", () => {
    expect(isNewerVersion("v0.1.0", "v0.2.0")).toBe(true)
    expect(isNewerVersion("v0.1.0", "v1.0.0")).toBe(true)
    expect(isNewerVersion("v0.1.0", "v0.0.9")).toBe(true)
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
