import { describe, it, expect } from "bun:test"
import {
  hexToRgb,
  rgbToHex,
  lerpColor,
  interpolateGradient,
} from "../../src/ui/gradient"

describe("hexToRgb", () => {
  it("parses #ff0000", () => {
    expect(hexToRgb("#ff0000")).toEqual({ r: 255, g: 0, b: 0 })
  })

  it("parses #00ff00", () => {
    expect(hexToRgb("#00ff00")).toEqual({ r: 0, g: 255, b: 0 })
  })

  it("parses #0000ff", () => {
    expect(hexToRgb("#0000ff")).toEqual({ r: 0, g: 0, b: 255 })
  })

  it("parses #ffffff", () => {
    expect(hexToRgb("#ffffff")).toEqual({ r: 255, g: 255, b: 255 })
  })

  it("parses #000000", () => {
    expect(hexToRgb("#000000")).toEqual({ r: 0, g: 0, b: 0 })
  })
})

describe("rgbToHex", () => {
  it("converts rgb to hex", () => {
    expect(rgbToHex(255, 0, 0)).toBe("#ff0000")
  })

  it("converts green", () => {
    expect(rgbToHex(0, 255, 0)).toBe("#00ff00")
  })

  it("clamps values below 0", () => {
    expect(rgbToHex(-10, 0, 0)).toBe("#000000")
  })

  it("clamps values above 255", () => {
    expect(rgbToHex(300, 0, 0)).toBe("#ff0000")
  })

  it("rounds fractional values", () => {
    expect(rgbToHex(127.4, 127.6, 0)).toBe("#7f8000")
  })
})

describe("lerpColor", () => {
  it("returns first color at t=0", () => {
    expect(lerpColor("#ff0000", "#00ff00", 0)).toBe("#ff0000")
  })

  it("returns second color at t=1", () => {
    expect(lerpColor("#ff0000", "#00ff00", 1)).toBe("#00ff00")
  })

  it("returns midpoint at t=0.5", () => {
    // lerp(255, 0, 0.5) = 127.5 → round → 128 = 0x80
    expect(lerpColor("#ff0000", "#0000ff", 0.5)).toBe("#800080")
  })

  it("interpolates red channel only", () => {
    expect(lerpColor("#ff0000", "#000000", 0.5)).toBe("#800000")
  })

  it("interpolates all channels", () => {
    expect(lerpColor("#000000", "#ffffff", 0.5)).toBe("#808080")
  })
})

describe("interpolateGradient", () => {
  it("returns single stop for any t", () => {
    expect(interpolateGradient(["#ff0000"], 0)).toBe("#ff0000")
    expect(interpolateGradient(["#ff0000"], 0.5)).toBe("#ff0000")
    expect(interpolateGradient(["#ff0000"], 1)).toBe("#ff0000")
  })

  it("returns first stop at t=0", () => {
    expect(interpolateGradient(["#ff0000", "#00ff00", "#0000ff"], 0)).toBe(
      "#ff0000",
    )
  })

  it("returns last stop at t=1", () => {
    expect(interpolateGradient(["#ff0000", "#00ff00", "#0000ff"], 1)).toBe(
      "#0000ff",
    )
  })

  it("returns midpoint of two stops at t=0.5", () => {
    expect(interpolateGradient(["#ff0000", "#0000ff"], 0.5)).toBe("#800080")
  })

  it("returns first segment midpoint with 3 stops at t=0.25", () => {
    // 3 stops: positions 0, 0.5, 1
    // t=0.25 → halfway between stop 0 (red) and stop 1 (green)
    expect(interpolateGradient(["#ff0000", "#00ff00", "#0000ff"], 0.25)).toBe(
      "#808000",
    )
  })

  it("returns second segment midpoint with 3 stops at t=0.75", () => {
    // t=0.75 → halfway between stop 1 (green) and stop 2 (blue)
    expect(interpolateGradient(["#ff0000", "#00ff00", "#0000ff"], 0.75)).toBe(
      "#008080",
    )
  })

  it("handles empty stops list", () => {
    expect(interpolateGradient([], 0.5)).toBe("#000000")
  })

  it("clamps t below 0", () => {
    expect(interpolateGradient(["#ff0000", "#00ff00"], -0.5)).toBe("#ff0000")
  })

  it("clamps t above 1", () => {
    expect(interpolateGradient(["#ff0000", "#00ff00"], 1.5)).toBe("#00ff00")
  })
})
