import { describe, it, expect } from "bun:test"
import type { CliRenderer } from "@opentui/core"
import { copyToClipboard, type ClipboardSpawn } from "../../src/ui/clipboard"

function mockRenderer(osc52Returns: boolean): CliRenderer {
  return {
    copyToClipboardOSC52: () => osc52Returns,
  } as unknown as CliRenderer
}

const spawnWith =
  (exitCode: number): ClipboardSpawn =>
  () => ({ exitCode })

describe("copyToClipboard", () => {
  it("returns true when pbcopy succeeds", () => {
    const result = copyToClipboard("hello", mockRenderer(false), spawnWith(0))
    expect(result).toBe(true)
  })

  it("returns false when OSC52 is last resort and returns false", () => {
    const result = copyToClipboard("test", mockRenderer(false), spawnWith(1))
    expect(result).toBe(false)
  })

  it("returns true when OSC52 succeeds", () => {
    const result = copyToClipboard("test", mockRenderer(true), spawnWith(1))
    expect(result).toBe(true)
  })

  it("does not throw for empty string", () => {
    const result = copyToClipboard("", mockRenderer(false), spawnWith(0))
    expect(result).toBe(true)
  })

  it("handles large text without throwing", () => {
    const large = "x".repeat(100_000)
    const result = copyToClipboard(large, mockRenderer(true), spawnWith(1))
    expect(result).toBe(true)
  })
})
