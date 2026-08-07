import { describe, expect, it } from "bun:test"
import { mkdtemp, rm, symlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { act, createRef } from "react"
import { testRender } from "@opentui/react/test-utils"
import { KeymapProvider } from "@opentui/keymap/react"
import { ThemeProvider } from "../../src/ui/theme"
import {
  ExportCollectionOverlay,
  type ExportCollectionOverlayHandle,
} from "../../src/ui/overlays/ExportCollectionOverlay"
import type { ExportCollectionValues } from "../../src/ui/collectionExport"
import { setupKeymap } from "./_helpers"

describe("ExportCollectionOverlay", () => {
  it("defaults to OpenAPI and previews the generated target", async () => {
    const { keymap, cleanup } = setupKeymap()
    const ref = createRef<ExportCollectionOverlayHandle>()
    const render = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <ExportCollectionOverlay visible ref={ref} collectionName="orders" />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 90, height: 22 },
    )
    await render.renderOnce()

    const frame = render.captureCharFrame()
    expect(frame).toContain("Export Collection")
    expect(frame).toContain("OpenAPI")
    expect(frame).toContain("Output Folder")
    expect(frame).toContain("orders.openapi.yml")
    expect(ref.current?.getFocus()).toBe("format")
    let result: ExportCollectionValues | null | undefined
    act(() => {
      result = ref.current?.confirm()
    })
    expect(result).toEqual({ format: "openapi", outputDir: "@/" })
    cleanup()
  })

  it("switches to Postman and shows its disclosure warning", async () => {
    const { keymap, host, cleanup } = setupKeymap()
    const ref = createRef<ExportCollectionOverlayHandle>()
    const render = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <ExportCollectionOverlay visible ref={ref} collectionName="orders" />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 90, height: 22 },
    )
    await render.renderOnce()
    act(() => host.press("return"))
    await render.renderOnce()
    act(() => host.press("down"))
    act(() => host.press("return"))
    await render.renderOnce()

    const frame = render.captureCharFrame()
    expect(frame).toContain("orders-postman")
    expect(frame).toContain("literal request values")
    let result: ExportCollectionValues | null | undefined
    act(() => {
      result = ref.current?.confirm()
    })
    expect(result).toEqual({ format: "postman", outputDir: "@/" })
    cleanup()
  })

  it("validates the output folder and keeps external errors inline", async () => {
    const { keymap, cleanup } = setupKeymap()
    const ref = createRef<ExportCollectionOverlayHandle>()
    const render = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <ExportCollectionOverlay visible ref={ref} collectionName="orders" />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 90, height: 22 },
    )
    await render.renderOnce()
    act(() => ref.current?.cycleFocus(1))
    await render.renderOnce()
    await act(async () => {
      await render.mockInput.pressKey("BACKSPACE")
      await render.mockInput.pressKey("BACKSPACE")
    })
    await render.renderOnce()
    let result: ExportCollectionValues | null | undefined
    act(() => {
      result = ref.current?.confirm()
    })
    expect(result).toBeNull()
    await render.renderOnce()
    expect(render.captureCharFrame()).toContain("Output folder is required")

    await act(async () => render.mockInput.typeText("  /exports  "))
    act(() => {
      result = ref.current?.confirm()
    })
    expect(result).toEqual({ format: "openapi", outputDir: "/exports" })

    act(() => ref.current?.setError("Save all changes before exporting"))
    await render.renderOnce()
    expect(render.captureCharFrame()).toContain(
      "Save all changes before exporting",
    )
    cleanup()
  })

  it("keeps target preview errors inline", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "noodle-export-preview-"))
    await symlink("orders-postman", join(outputDir, "orders-postman"))
    const { keymap, host, cleanup } = setupKeymap()
    const ref = createRef<ExportCollectionOverlayHandle>()

    try {
      const render = await testRender(
        <KeymapProvider keymap={keymap}>
          <ThemeProvider activeIndex={0} previewIndex={null}>
            <ExportCollectionOverlay
              visible
              ref={ref}
              collectionName="orders"
            />
          </ThemeProvider>
        </KeymapProvider>,
        { width: 90, height: 22 },
      )
      await render.renderOnce()
      act(() => ref.current?.cycleFocus(1))
      await render.renderOnce()
      await act(async () => {
        await render.mockInput.pressKey("BACKSPACE")
        await render.mockInput.pressKey("BACKSPACE")
        await render.mockInput.typeText(outputDir)
      })
      act(() => ref.current?.cycleFocus(1))
      act(() => host.press("return"))
      act(() => host.press("down"))
      act(() => host.press("return"))
      await render.renderOnce()

      const frame = render.captureCharFrame()
      expect(frame).toContain("Export Collection")
      expect(frame).toContain("ELOOP")
    } finally {
      cleanup()
      await rm(outputDir, { recursive: true, force: true })
    }
  })
})
