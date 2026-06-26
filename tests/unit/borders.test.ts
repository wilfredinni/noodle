import { describe, it, expect } from "bun:test"
import { FullBorder, LeftBar, PaneBorder } from "../../src/ui/borders"

describe("FullBorder", () => {
  it("borders all four sides", () => {
    expect(FullBorder.border).toEqual(["left", "right", "top", "bottom"])
  })

  it("uses single-line box drawing chars", () => {
    expect(FullBorder.customBorderChars.vertical).toBe("│")
    expect(FullBorder.customBorderChars.horizontal).toBe("─")
  })

  it("has corner chars for full box", () => {
    expect(FullBorder.customBorderChars.topLeft).toBe("┌")
    expect(FullBorder.customBorderChars.topRight).toBe("┐")
    expect(FullBorder.customBorderChars.bottomLeft).toBe("└")
    expect(FullBorder.customBorderChars.bottomRight).toBe("┘")
  })

  it("has T-connector chars", () => {
    expect(FullBorder.customBorderChars.topT).toBe("┬")
    expect(FullBorder.customBorderChars.bottomT).toBe("┴")
    expect(FullBorder.customBorderChars.leftT).toBe("├")
    expect(FullBorder.customBorderChars.rightT).toBe("┤")
    expect(FullBorder.customBorderChars.cross).toBe("┼")
  })
})

describe("LeftBar", () => {
  it("borders left side only", () => {
    expect(LeftBar.border).toEqual(["left"])
  })

  it("uses thick vertical char", () => {
    expect(LeftBar.customBorderChars.vertical).toBe("┃")
  })

  it("has empty corners and horizontal", () => {
    expect(LeftBar.customBorderChars.topLeft).toBe("")
    expect(LeftBar.customBorderChars.bottomLeft).toBe("")
    expect(LeftBar.customBorderChars.topRight).toBe("")
    expect(LeftBar.customBorderChars.bottomRight).toBe("")
    expect(LeftBar.customBorderChars.horizontal).toBe(" ")
  })
})

describe("PaneBorder", () => {
  it("uses thick vertical on left and right", () => {
    expect(PaneBorder.border).toEqual(["left", "right"])
    expect(PaneBorder.customBorderChars.vertical).toBe("┃")
    expect(PaneBorder.customBorderChars.horizontal).toBe(" ")
  })

  it("has empty corners", () => {
    expect(PaneBorder.customBorderChars.topLeft).toBe("")
    expect(PaneBorder.customBorderChars.bottomLeft).toBe("")
    expect(PaneBorder.customBorderChars.topRight).toBe("")
    expect(PaneBorder.customBorderChars.bottomRight).toBe("")
  })
})
