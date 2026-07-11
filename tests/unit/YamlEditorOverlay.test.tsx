import { describe, it, expect, mock } from "bun:test"
import { testRender } from "@opentui/react/test-utils"
import { extend } from "@opentui/react"
import { createTestKeymap } from "@opentui/keymap/testing"
import {
  registerEnabledFields,
  registerDefaultKeys,
} from "@opentui/keymap/addons"
import { KeymapProvider } from "@opentui/keymap/react"
import type { KeymapProviderProps } from "@opentui/keymap/react"
import { ThemeProvider } from "../../src/ui/theme"
import { YamlEditorOverlay } from "../../src/ui/editor/YamlEditorOverlay"
import { ConfirmOverlay } from "../../src/ui/ConfirmOverlay"
import { CodeEditorRenderable } from "../../src/ui/editor/CodeEditor"

extend({ "code-editor": CodeEditorRenderable })

function setupKeymap() {
  const { keymap, host, cleanup: hostCleanup } = createTestKeymap()
  const disposeEnabled = registerEnabledFields(keymap)
  const disposeKeys = registerDefaultKeys(keymap)
  keymap.setData("app.mode", "base")
  keymap.setData("app.focus", "sidebar")
  keymap.setData("app.overlay", "none")
  return {
    keymap: keymap as unknown as KeymapProviderProps["keymap"],
    host,
    cleanup: () => {
      disposeEnabled()
      disposeKeys()
      hostCleanup()
    },
  }
}

const MOCK_YAML = "name: test\nmethod: GET\nurl: https://example.com\n"
let mockedContent = MOCK_YAML
let writeCallCount = 0

mock.module("node:fs/promises", () => ({
  readFile: () => Promise.resolve(mockedContent),
  writeFile: () => {
    writeCallCount++
    return Promise.resolve()
  },
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

  it("rejects invalid YAML on save", async () => {
    mockedContent = "name: test\nmethod: GET\nurl: [broken\n"
    writeCallCount = 0
    const { keymap, host, cleanup } = setupKeymap()
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

    host.press("s", { ctrl: true })
    await new Promise((r) => setTimeout(r, 20))
    await renderOnce()

    const frame = captureCharFrame()
    expect(frame).toContain("Save error:")
    expect(writeCallCount).toBe(0)
    cleanup()
    mockedContent = MOCK_YAML
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
    expect(frame).toContain("cancel")
    // Old bracket format not present
    expect(frame).not.toContain("[y]")
    expect(frame).not.toContain("[n]")
    // Shortcut keys present
    expect(frame).toContain("y")
    expect(frame).toContain("n")
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
