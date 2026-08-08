import { describe, expect, it } from "bun:test"
import { act, createRef } from "react"
import { MouseButtons } from "@opentui/core/testing"
import { createTestRender } from "../testRender"
import { createTestKeymap } from "@opentui/keymap/testing"
import {
  registerDefaultKeys,
  registerEnabledFields,
} from "@opentui/keymap/addons"
import { KeymapProvider } from "@opentui/keymap/react"
import type { KeymapProviderProps } from "@opentui/keymap/react"
import { ThemeProvider } from "../../src/ui/theme"
import {
  ImportCurlOverlay,
  type ImportCurlOverlayHandle,
} from "../../src/ui/overlays/ImportCurlOverlay"

const testRender = createTestRender()

function setupKeymap() {
  const { keymap, cleanup: hostCleanup } = createTestKeymap()
  const disposeEnabled = registerEnabledFields(keymap)
  const disposeKeys = registerDefaultKeys(keymap)
  return {
    keymap: keymap as unknown as KeymapProviderProps["keymap"],
    cleanup: () => {
      disposeEnabled()
      disposeKeys()
      hostCleanup()
    },
  }
}

describe("ImportCurlOverlay", () => {
  it("renders the required fields and selected folder", async () => {
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <ImportCurlOverlay
            visible
            folderPaths={[
              { id: "", label: "(root)" },
              { id: "api", label: "API" },
            ]}
            initialFolderPath="api"
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 80, height: 24 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("Import cURL Request")
    expect(frame).toContain("cURL Command")
    expect(frame).toContain("Request Name")
    expect(frame).toContain("Folder")
    expect(frame).toContain("API")
    cleanup()
  })

  it("requires a command and request name", async () => {
    const { keymap, cleanup } = setupKeymap()
    const ref = createRef<ImportCurlOverlayHandle>()
    const { renderOnce } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <ImportCurlOverlay
            visible
            ref={ref}
            folderPaths={[{ id: "", label: "(root)" }]}
            initialFolderPath=""
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 80, height: 24 },
    )
    await renderOnce()
    await act(async () => {
      expect(ref.current?.confirm()).toBeNull()
    })
    cleanup()
  })

  it("focuses folder, then name, then cURL command", async () => {
    const { keymap, cleanup } = setupKeymap()
    const ref = createRef<ImportCurlOverlayHandle>()
    const { renderOnce } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <ImportCurlOverlay
            visible
            ref={ref}
            folderPaths={[{ id: "", label: "(root)" }]}
            initialFolderPath=""
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 80, height: 24 },
    )
    await renderOnce()
    expect(ref.current?.getFocus()).toBe("folder")
    await act(async () => ref.current?.cycleFocus(1))
    expect(ref.current?.getFocus()).toBe("name")
    await act(async () => ref.current?.cycleFocus(1))
    expect(ref.current?.getFocus()).toBe("curl")
    cleanup()
  })

  it("runs footer actions when clicked without dot separators", async () => {
    const { keymap, cleanup } = setupKeymap()
    let saved = 0
    let closed = 0
    const { renderOnce, captureCharFrame, mockMouse } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <ImportCurlOverlay
            visible
            folderPaths={[{ id: "", label: "(root)" }]}
            initialFolderPath=""
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
})
