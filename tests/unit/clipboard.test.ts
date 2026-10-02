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

  it("uses only Windows clip with BOM-prefixed UTF-16LE input", () => {
    const text = "Noodle café 界 🍜\nsecond line"
    const commands: string[][] = []
    const result = copyToClipboard(
      text,
      mockRenderer(false),
      (command, { stdin }) => {
        commands.push(command)
        expect(Buffer.from(stdin).toString("utf16le")).toBe(`\ufeff${text}`)
        expect([...stdin.slice(0, 2)]).toEqual([255, 254])
        return { exitCode: 0 }
      },
      "win32",
    )
    expect(result).toBe(true)
    expect(commands).toEqual([["clip.exe"]])
  })

  it("filters Linux clipboard commands and preserves UTF-8 input", () => {
    const commands: string[][] = []
    expect(
      copyToClipboard(
        "café 🍜",
        mockRenderer(true),
        (command, { stdin }) => {
          commands.push(command)
          expect(new TextDecoder().decode(stdin)).toBe("café 🍜")
          return { exitCode: 1 }
        },
        "linux",
      ),
    ).toBe(true)
    expect(commands).toEqual([
      ["xclip", "-selection", "clipboard"],
      ["wl-copy"],
    ])
  })

  it.skipIf(process.platform !== "win32")(
    "round trips Unicode through the real Windows clipboard",
    () => {
      const text = "Noodle café 界 🍜"
      const read = () => {
        const result = Bun.spawnSync([
          "powershell.exe",
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          "[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes([string](Get-Clipboard -Raw)))",
        ])
        expect(result.exitCode).toBe(0)
        return Buffer.from(result.stdout.toString().trim(), "base64").toString(
          "utf8",
        )
      }
      const original = read()
      try {
        expect(copyToClipboard(text, mockRenderer(false))).toBe(true)
        expect(read()).toBe(text)
      } finally {
        copyToClipboard(original, mockRenderer(false))
      }
    },
  )
})
