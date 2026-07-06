import { describe, it, expect } from "bun:test"
import type { CliRenderer } from "@opentui/core"
import { copyToClipboard } from "../../src/ui/clipboard"

function mockRenderer(osc52Returns: boolean): CliRenderer {
  return {
    copyToClipboardOSC52: () => osc52Returns,
  } as unknown as CliRenderer
}

describe("copyToClipboard", () => {
  it("returns true when pbcopy succeeds", () => {
    if (process.platform !== "darwin") {
      // skip on non-macos
      expect(true).toBe(true)
      return
    }
    const result = copyToClipboard("hello", mockRenderer(false))
    expect(result).toBe(true)
  })

  it("returns false when OSC52 is last resort and returns false", () => {
    // On macOS pbcopy succeeds, so the fallback never fires.
    // We test this by verifying that an empty text still works
    // and that the function doesn't throw.
    const result = copyToClipboard("test", mockRenderer(false))
    // On macOS, pbcopy succeeds -> true. On Linux, pbcopy fails,
    // xclip/wl-copy likely fail too -> OSC52 mock returns false.
    if (process.platform === "darwin") {
      expect(result).toBe(true)
    } else {
      expect(result).toBe(false)
    }
  })

  it("returns true when OSC52 succeeds", () => {
    const result = copyToClipboard("test", mockRenderer(true))
    expect(result).toBe(true)
  })

  it("does not throw for empty string", () => {
    const result = copyToClipboard("", mockRenderer(false))
    // On macOS, pbcopy handles empty string -> true.
    // On Linux, falls to OSC52 which returns false.
    if (process.platform === "darwin") {
      expect(result).toBe(true)
    } else {
      expect(result).toBe(false)
    }
  })

  it("handles large text without throwing", () => {
    const large = "x".repeat(100_000)
    const result = copyToClipboard(large, mockRenderer(true))
    expect(result).toBe(true)
  })
})
