import { describe, it, expect, mock } from "bun:test"
import { testRender } from "@opentui/react/test-utils"
import { createTestKeymap } from "@opentui/keymap/testing"
import {
  registerEnabledFields,
  registerDefaultKeys,
} from "@opentui/keymap/addons"
import { KeymapProvider } from "@opentui/keymap/react"
import type { KeymapProviderProps } from "@opentui/keymap/react"
import { ThemeProvider } from "../../src/ui/theme"
import { YamlEditorOverlay } from "../../src/ui/YamlEditorOverlay"
import { ConfirmOverlay } from "../../src/ui/ConfirmOverlay"

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

const MOCK_YAML = "name: test\nmethod: GET\nurl: https://example.com\n"

mock.module("node:fs/promises", () => ({
  readFile: () => Promise.resolve(MOCK_YAML),
  writeFile: () => Promise.resolve(),
}))

describe("YamlEditorOverlay", () => {
  it("renders title with request name", async () => {
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <YamlEditorOverlay
            visible
            filePath="/tmp/test.yml"
            requestName="get-users"
            onSaved={() => {}}
            onClose={() => {}}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 100, height: 30 },
    )
    await renderOnce()
    await new Promise((r) => setTimeout(r, 20))
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("get-users.yml")
    expect(frame).toContain("esc")
    cleanup()
  })

  it("renders footer with save and close keybindings", async () => {
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <YamlEditorOverlay
            visible
            filePath="/tmp/test.yml"
            requestName="get-users"
            onSaved={() => {}}
            onClose={() => {}}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 100, height: 30 },
    )
    await renderOnce()
    await new Promise((r) => setTimeout(r, 20))
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("^S")
    expect(frame).toContain("save")
    expect(frame).toContain("esc")
    expect(frame).toContain("close")
    cleanup()
  })

  it("shows loading text when content not yet loaded (visible=false)", async () => {
    // Clear the module mock to test without content
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <YamlEditorOverlay
            visible={false}
            filePath="/tmp/test.yml"
            requestName="get-users"
            onSaved={() => {}}
            onClose={() => {}}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 100, height: 30 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).not.toContain("Edit:")
    cleanup()
  })

  it("returns null when not visible", async () => {
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <YamlEditorOverlay
            visible={false}
            filePath="/tmp/test.yml"
            requestName="get-users"
            onSaved={() => {}}
            onClose={() => {}}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 100, height: 30 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).not.toContain("get-users")
    cleanup()
  })

  it("renders footer keybindings aligned to the right", async () => {
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <YamlEditorOverlay
            visible
            filePath="/tmp/test.yml"
            requestName="get-users"
            onSaved={() => {}}
            onClose={() => {}}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 100, height: 30 },
    )
    await renderOnce()
    await new Promise((r) => setTimeout(r, 20))
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toMatch(/\^S.*save.*esc.*close/)
    cleanup()
  })
})

describe("ConfirmOverlay", () => {
  it("renders confirm and cancel as shortcut text not brackets", async () => {
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <ConfirmOverlay
            visible
            message="Save changes to test?"
            selectedIndex={0}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 60, height: 20 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("Confirm")
    expect(frame).toContain("Cancel")
    // Old bracket format not present
    expect(frame).not.toContain("[y]")
    expect(frame).not.toContain("[n]")
    // Shortcut keys present
    expect(frame).toContain("Y")
    expect(frame).toContain("N")
    cleanup()
  })

  it("renders with message text", async () => {
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <ConfirmOverlay
            visible
            message="Save changes to test?"
            selectedIndex={0}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 60, height: 20 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("Save changes to test?")
    cleanup()
  })
})
