import { describe, it, expect } from "bun:test"
import { act, createRef } from "react"
import { RGBA, ScrollBoxRenderable } from "@opentui/core"
import { MouseButtons } from "@opentui/core/testing"
import { createTestRender } from "../testRender"
import { KeymapProvider } from "@opentui/keymap/react"
import { ThemeProvider, THEMES } from "../../src/ui/theme"
import {
  slugify,
  METHOD_ITEMS,
  NewRequestOverlay,
  type NewRequestOverlayHandle,
} from "../../src/ui/overlays/NewRequestOverlay"
import { setupKeymap } from "./_helpers"

const testRender = createTestRender()

function hexToRgba(hex: string): RGBA {
  return RGBA.fromInts(
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  )
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

  it("uses sidebar method color tokens", () => {
    expect(METHOD_ITEMS.map((item) => item.color)).toEqual([
      "success",
      "warning",
      "info",
      "info",
      "error",
      "textMuted",
      "textMuted",
    ])
  })
})

describe("NewRequestOverlay mode prop", () => {
  it("focuses the method selector when clicked", async () => {
    const { keymap, cleanup } = setupKeymap()
    const ref = createRef<NewRequestOverlayHandle>()
    const { renderOnce, mockMouse } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <NewRequestOverlay visible ref={ref} />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 80, height: 24 },
    )
    await renderOnce()
    expect(ref.current?.getFocus()).toBe("name")

    await act(async () => {
      await mockMouse.click(15, 14, MouseButtons.LEFT)
    })
    expect(ref.current?.getFocus()).toBe("method")
    cleanup()
  })

  it("focuses the URL field when clicked", async () => {
    const { keymap, cleanup } = setupKeymap()
    const ref = createRef<NewRequestOverlayHandle>()
    const { renderOnce, captureCharFrame, mockMouse } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <NewRequestOverlay visible ref={ref} />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 80, height: 24 },
    )
    await renderOnce()
    const rows = captureCharFrame().split("\n")
    const y = rows.findIndex((row) => row.includes("https://api.example.com"))
    await act(async () => {
      await mockMouse.click(
        rows[y]!.indexOf("https://api.example.com"),
        y,
        MouseButtons.LEFT,
      )
    })
    expect(ref.current?.getFocus()).toBe("url")
    cleanup()
  })

  it("ignores right clicks on text fields", async () => {
    const { keymap, cleanup } = setupKeymap()
    const ref = createRef<NewRequestOverlayHandle>()
    const { renderOnce, captureCharFrame, mockMouse } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <NewRequestOverlay visible ref={ref} />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 80, height: 24 },
    )
    await renderOnce()
    const rows = captureCharFrame().split("\n")
    const y = rows.findIndex((row) => row.includes("https://api.example.com"))

    await act(async () => {
      await mockMouse.click(
        rows[y]!.indexOf("https://api.example.com"),
        y,
        MouseButtons.RIGHT,
      )
    })

    expect(ref.current?.getFocus()).toBe("name")
    cleanup()
  })

  it("runs footer actions when clicked without dot separators", async () => {
    const { keymap, cleanup } = setupKeymap()
    let saved = 0
    let closed = 0
    const { renderOnce, captureCharFrame, mockMouse } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <NewRequestOverlay
            visible
            onConfirm={() => saved++}
            onClose={() => closed++}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 80, height: 24 },
    )
    await renderOnce()
    const rows = captureCharFrame().split("\n")
    const y = rows.findIndex((row) => row.includes("save"))
    expect(rows[y]).not.toContain("·")
    await act(async () => {
      await mockMouse.click(rows[y]!.indexOf("save"), y, MouseButtons.LEFT)
      await mockMouse.click(rows[y]!.indexOf("close"), y, MouseButtons.LEFT)
    })
    expect(saved).toBe(1)
    expect(closed).toBe(1)
    cleanup()
  })

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

  it("highlights resolved path params in the edit URL", async () => {
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureSpans } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <NewRequestOverlay
            visible
            mode="edit"
            initialUrl="https://api.example.com/users/:userId"
            initialPathParams={[{ name: "userId", value: "42", enabled: true }]}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 80, height: 20 },
    )
    await renderOnce()
    await renderOnce()
    const spans = captureSpans().lines.flatMap((line) => line.spans)
    const pathParam = spans.find((span) => span.text.includes(":userId"))
    expect(pathParam).toBeDefined()
    expect(pathParam!.fg.equals(hexToRgba(THEMES[0]!.primary))).toBe(true)
    cleanup()
  })

  it("pre-fills folder when folderPaths and initialFolderPath are given in edit mode", async () => {
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
            folderPaths={[
              { id: "", label: "(root)" },
              { id: "auth", label: "auth" },
              { id: "users", label: "users" },
            ]}
            initialFolderPath="auth"
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 80, height: 20 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("Folder")
    expect(frame).toContain("auth")
    expect(frame).toContain("Get Users")
    cleanup()
  })

  for (const mode of ["create", "edit"] as const) {
    it(`scrolls the folder selector in ${mode} mode`, async () => {
      const { keymap, host, cleanup } = setupKeymap()
      try {
        const folderPaths = Array.from({ length: 18 }, (_, index) => ({
          id: `folder-${index}`,
          label: `folder-${index}`,
        }))
        const render = await testRender(
          <KeymapProvider keymap={keymap}>
            <ThemeProvider activeIndex={0} previewIndex={null}>
              <NewRequestOverlay
                visible
                mode={mode}
                folderPaths={folderPaths}
                initialFolderPath="folder-17"
              />
            </ThemeProvider>
          </KeymapProvider>,
          { width: 80, height: 24 },
        )
        await render.renderOnce()

        act(() => host.press("return"))
        await render.renderOnce()
        await render.renderOnce()

        const dropdown = render.renderer.root.getChildren().at(-1)
        const scrollbox = dropdown?.getChildren()[0]
        expect(scrollbox).toBeInstanceOf(ScrollBoxRenderable)
        expect(dropdown?.width).toBe(52)
        expect((scrollbox as ScrollBoxRenderable).height).toBe(10)
        expect(
          (scrollbox as ScrollBoxRenderable).verticalScrollBar.visible,
        ).toBe(true)
        expect((scrollbox as ScrollBoxRenderable).scrollTop).toBeGreaterThan(0)
      } finally {
        cleanup()
      }
    })
  }

  it("shows the contextual folder in create mode", async () => {
    const { keymap, cleanup } = setupKeymap()
    const ref = createRef<NewRequestOverlayHandle>()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <NewRequestOverlay
            visible
            ref={ref}
            folderPaths={[
              { id: "", label: "(root)" },
              { id: "auth", label: "auth" },
            ]}
            initialFolderPath="auth"
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 80, height: 20 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("Folder")
    expect(frame).toContain("auth")
    expect(ref.current?.getFocus()).toBe("folder")
    cleanup()
  })

  it("shows root as the default create folder", async () => {
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <NewRequestOverlay
            visible
            folderPaths={[
              { id: "", label: "(root)" },
              { id: "auth", label: "auth" },
            ]}
            initialFolderPath=""
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 80, height: 20 },
    )
    await renderOnce()
    expect(captureCharFrame()).toContain("(root)")
    cleanup()
  })
})
