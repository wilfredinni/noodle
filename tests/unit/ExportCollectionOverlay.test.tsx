import { describe, expect, it } from "bun:test"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { act, createRef, useEffect } from "react"
import { MouseButtons } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { KeymapProvider, useKeymap } from "@opentui/keymap/react"
import { ThemeProvider } from "../../src/ui/theme"
import {
  ExportCollectionOverlay,
  type ExportCollectionOverlayHandle,
} from "../../src/ui/overlays/ExportCollectionOverlay"
import type { ExportCollectionValues } from "../../src/ui/collectionExport"
import { useFormOverlayIntercept } from "../../src/ui/intercepts/useFormOverlayIntercept"
import { VariableCompletionInterceptor } from "../../src/ui/variable-completion/variableCompletionInterceptor"
import { setupKeymap } from "./_helpers"

function Harness({
  overlayRef,
  onConfirm,
  onCancel,
  collectionName = "orders",
  pathCompletionRoot,
}: {
  overlayRef: React.RefObject<ExportCollectionOverlayHandle | null>
  onConfirm: (values: ExportCollectionValues) => void
  onCancel: () => void
  collectionName?: string
  pathCompletionRoot?: string
}) {
  const keymap = useKeymap()
  const actions = useFormOverlayIntercept({
    visible: true,
    handleRef: overlayRef,
    onConfirm,
    onCancel,
    passThroughFocuses: ["format"],
  })

  useEffect(
    () =>
      keymap.intercept(
        "key",
        (ctx) => {
          if (ctx.event.name === "x") throw new Error("background key leaked")
        },
        { priority: 0 },
      ),
    [keymap],
  )

  return (
    <>
      <VariableCompletionInterceptor />
      <ExportCollectionOverlay
        visible
        ref={overlayRef}
        collectionName={collectionName}
        pathCompletionRoot={pathCompletionRoot}
        onConfirm={actions.confirm}
        onClose={actions.cancel}
      />
    </>
  )
}

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

  it("uses directory completion and owns form/footer actions", async () => {
    const root = await mkdtemp(join(tmpdir(), "noodle-export-overlay-"))
    await mkdir(join(root, "Exports"))
    const { keymap, host, cleanup } = setupKeymap()
    const ref = createRef<ExportCollectionOverlayHandle>()
    const confirmed: ExportCollectionValues[] = []
    let closed = 0

    try {
      const render = await testRender(
        <KeymapProvider keymap={keymap}>
          <ThemeProvider activeIndex={0} previewIndex={null}>
            <Harness
              overlayRef={ref}
              pathCompletionRoot={root}
              onConfirm={(values) => confirmed.push(values)}
              onCancel={() => closed++}
            />
          </ThemeProvider>
        </KeymapProvider>,
        { width: 90, height: 22 },
      )
      await render.renderOnce()
      await act(async () => host.press("tab"))
      expect(ref.current?.getFocus()).toBe("output")
      await render.waitForFrame((frame) => frame.includes("Exports/"))
      await render.renderOnce()
      await render.renderOnce()
      await act(async () => host.press("return"))
      await render.renderOnce()
      let result: ExportCollectionValues | null | undefined
      act(() => {
        result = ref.current?.confirm()
      })
      expect(result).toEqual({
        format: "openapi",
        outputDir: "@/Exports",
      })

      await act(async () => host.press("tab", { shift: true }))
      await act(async () => host.press("x"))
      await act(async () => host.press("tab"))
      await act(async () => host.press("s", { ctrl: true }))
      expect(confirmed).toEqual([{ format: "openapi", outputDir: "@/Exports" }])

      const rows = render.captureCharFrame().split("\n")
      const footerY = rows.findIndex((row) => row.includes("export"))
      await act(async () => {
        await render.mockMouse.click(
          rows[footerY]!.lastIndexOf("export"),
          footerY,
          MouseButtons.LEFT,
        )
        await render.mockMouse.click(
          rows[footerY]!.indexOf("close"),
          footerY,
          MouseButtons.LEFT,
        )
      })
      expect(confirmed).toHaveLength(2)
      expect(closed).toBe(1)
    } finally {
      cleanup()
      await rm(root, { recursive: true, force: true })
    }
  })
})
