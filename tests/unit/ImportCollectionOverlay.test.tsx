import { describe, expect, it } from "bun:test"
import { act, createRef } from "react"
import { createTestRender } from "../testRender"
import { KeymapProvider } from "@opentui/keymap/react"
import { MouseButtons } from "@opentui/core/testing"
import { ThemeProvider } from "../../src/ui/theme"
import {
  ImportCollectionOverlay,
  type ImportCollectionOverlayHandle,
} from "../../src/ui/overlays/ImportCollectionOverlay"
import { setupKeymap } from "./_helpers"

const testRender = createTestRender()

describe("ImportCollectionOverlay", () => {
  it("defaults to a new collection and exposes supported formats", async () => {
    const { keymap, cleanup } = setupKeymap()
    const ref = createRef<ImportCollectionOverlayHandle>()
    const render = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <ImportCollectionOverlay
            visible
            ref={ref}
            initialParentDir="/collections"
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 90, height: 24 },
    )
    await render.renderOnce()

    const frame = render.captureCharFrame()
    expect(frame).toContain("Import Collection")
    expect(frame).toContain("New collection")
    expect(frame).toContain("Parent Folder")
    expect(frame).toContain("OpenAPI 3, Swagger 2, Postman, and Insomnia")
    let values: ReturnType<ImportCollectionOverlayHandle["confirm"]>
    act(() => {
      values = ref.current?.confirm() ?? null
    })
    expect(values!).toEqual({
      source: "@/",
      destination: "new",
      parentDir: "/collections",
    })
    act(() => render.renderer.destroy())
    cleanup()
  })

  it("switches to the current collection and hides the parent field", async () => {
    const { keymap, host, cleanup } = setupKeymap()
    const ref = createRef<ImportCollectionOverlayHandle>()
    const render = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <ImportCollectionOverlay
            visible
            ref={ref}
            initialParentDir="/collections"
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 90, height: 24 },
    )
    await render.renderOnce()
    act(() => ref.current?.cycleFocus(1))
    act(() => host.press("return"))
    act(() => host.press("down"))
    act(() => host.press("return"))
    await render.renderOnce()

    expect(render.captureCharFrame()).not.toContain("Parent Folder")
    let values: ReturnType<ImportCollectionOverlayHandle["confirm"]>
    act(() => {
      values = ref.current?.confirm() ?? null
    })
    expect(values!).toEqual({
      source: "@/",
      destination: "current",
      parentDir: "/collections",
    })
    act(() => render.renderer.destroy())
    cleanup()
  })

  it("renders pending state and external errors inline", async () => {
    const { keymap, cleanup } = setupKeymap()
    const ref = createRef<ImportCollectionOverlayHandle>()
    let closeCount = 0
    const render = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <ImportCollectionOverlay
            visible
            pending
            ref={ref}
            initialParentDir="/collections"
            onClose={() => closeCount++}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 90, height: 24 },
    )
    act(() => ref.current?.setError("import target already exists"))
    await render.renderOnce()

    const frame = render.captureCharFrame()
    expect(frame).toContain("importing...")
    expect(frame).toContain("import target already exists")
    await act(async () => {
      await render.mockMouse.click(0, 0, MouseButtons.LEFT)
    })
    expect(closeCount).toBe(0)
    act(() => render.renderer.destroy())
    cleanup()
  })
})
