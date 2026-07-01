import { describe, it, expect } from "bun:test"
import { testRender } from "@opentui/react/test-utils"
import { createTestKeymap } from "@opentui/keymap/testing"
import {
  registerEnabledFields,
  registerDefaultKeys,
} from "@opentui/keymap/addons"
import { KeymapProvider } from "@opentui/keymap/react"
import type { KeymapProviderProps } from "@opentui/keymap/react"
import { ThemeProvider } from "../../src/ui/theme"
import {
  slugify,
  METHOD_ITEMS,
  NewRequestOverlay,
} from "../../src/ui/NewRequestOverlay"

function setupKeymap() {
  const { keymap, cleanup: hostCleanup } = createTestKeymap()
  const disposeEnabled = registerEnabledFields(keymap)
  const disposeKeys = registerDefaultKeys(keymap)
  keymap.setData("app.mode", "base")
  keymap.setData("app.focus", "sidebar")
  keymap.setData("app.overlay", "none")
  return {
    keymap: keymap as unknown as KeymapProviderProps["keymap"],
    cleanup: () => {
      disposeEnabled()
      disposeKeys()
      hostCleanup()
    },
  }
}

describe("slugify", () => {
  it("converts spaces to hyphens and lowercases", () => {
    expect(slugify("Get Users")).toBe("get-users")
  })

  it("handles single word", () => {
    expect(slugify("Users")).toBe("users")
  })

  it("strips special characters", () => {
    expect(slugify("Get Users!!!")).toBe("get-users")
  })

  it("strips leading and trailing hyphens", () => {
    expect(slugify("-test-")).toBe("test")
  })

  it("handles empty string", () => {
    expect(slugify("")).toBe("")
  })

  it("handles multiple consecutive special chars", () => {
    expect(slugify("foo   bar")).toBe("foo-bar")
  })

  it("truncates at 50 chars", () => {
    const long = "a".repeat(60)
    expect(slugify(long).length).toBeLessThanOrEqual(50)
  })
})

describe("METHOD_ITEMS", () => {
  it("contains all standard methods", () => {
    const ids = METHOD_ITEMS.map((i) => i.id)
    expect(ids).toContain("GET")
    expect(ids).toContain("POST")
    expect(ids).toContain("PUT")
    expect(ids).toContain("PATCH")
    expect(ids).toContain("DELETE")
    expect(ids).toContain("HEAD")
    expect(ids).toContain("OPTIONS")
  })

  it("DELETE label is abbreviated to DEL", () => {
    const del = METHOD_ITEMS.find((i) => i.id === "DELETE")
    expect(del?.label).toBe("DEL")
  })
})

describe("NewRequestOverlay mode prop", () => {
  it("shows 'New Request' title when mode is not set", async () => {
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <NewRequestOverlay visible />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 60, height: 20 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("New Request")
    expect(frame).not.toContain("Edit Request")
    cleanup()
  })

  it("shows 'Edit Request' title when mode=edit", async () => {
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <NewRequestOverlay visible mode="edit" />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 60, height: 20 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("Edit Request")
    expect(frame).not.toContain("New Request")
    cleanup()
  })

  it("pre-fills inputs with initial values when mode=edit", async () => {
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <NewRequestOverlay
            visible
            mode="edit"
            initialName="Get Users"
            initialMethod="POST"
            initialUrl="https://api.example.com/v2/users"
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 80, height: 20 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("Get Users")
    expect(frame).toContain("POST")
    expect(frame).toContain("https://api.example.com/v2/users")
    cleanup()
  })
})
