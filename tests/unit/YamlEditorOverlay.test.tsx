import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { act } from "react"
import { MouseButtons } from "@opentui/core/testing"
import { createTestRender } from "../testRender"
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
import { ConfirmOverlay } from "../../src/ui/overlays/ConfirmOverlay"
import { CodeEditorRenderable } from "../../src/ui/editor/CodeEditor"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

const testRender = createTestRender()

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
let testDir: string
let filePath: string

async function loadEditor(
  renderOnce: () => Promise<void>,
  delayMs = 20,
): Promise<void> {
  await act(async () => {
    await renderOnce()
    await new Promise((resolve) => setTimeout(resolve, delayMs))
  })
  await renderOnce()
}

async function waitForRow(
  captureCharFrame: () => string,
  renderOnce: () => Promise<void>,
  predicate: (row: string) => boolean,
): Promise<[string, number]> {
  const deadline = Date.now() + 2_000
  while (Date.now() < deadline) {
    const rows = captureCharFrame().split("\n")
    const index = rows.findIndex(predicate)
    if (index >= 0) return [rows[index]!, index]
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
    })
    await renderOnce()
  }
  throw new Error("Expected YAML fold icon")
}

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), "noodle-yaml-editor-"))
  filePath = join(testDir, "test.yml")
  await writeFile(filePath, MOCK_YAML)
})

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true })
})

describe("YamlEditorOverlay", () => {
  it("renders title with request name", async () => {
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <YamlEditorOverlay
            visible
            filePath={filePath}
            requestName="get-users"
            saveKey="ctrl+s"
            onSaved={() => {}}
            onClose={() => {}}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 100, height: 30 },
    )
    await loadEditor(renderOnce)
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
            filePath={filePath}
            requestName="get-users"
            saveKey="ctrl+s"
            onSaved={() => {}}
            onClose={() => {}}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 100, height: 30 },
    )
    await loadEditor(renderOnce)
    const frame = captureCharFrame()
    expect(frame).toContain("^s")
    expect(frame).toContain("save")
    expect(frame).toContain("esc")
    expect(frame).toContain("close")
    cleanup()
  })

  it("runs footer save and close actions on click", async () => {
    const { keymap, cleanup } = setupKeymap()
    let saved = 0
    let closed = 0
    let resolveSaved: (() => void) | undefined
    const savedPromise = new Promise<void>((resolve) => {
      resolveSaved = resolve
    })
    const { renderOnce, captureCharFrame, mockMouse } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <YamlEditorOverlay
            visible
            filePath={filePath}
            requestName="get-users"
            saveKey="ctrl+s"
            onSaved={() => {
              saved++
              resolveSaved?.()
            }}
            onClose={() => closed++}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 100, height: 30 },
    )
    await loadEditor(renderOnce)

    const rows = captureCharFrame().split("\n")
    const y = rows.findIndex((row) => row.includes("save"))
    await act(async () => {
      await mockMouse.click(rows[y]!.indexOf("save"), y, MouseButtons.LEFT)
    })
    await savedPromise
    await act(async () => {
      await mockMouse.click(rows[y]!.indexOf("close"), y, MouseButtons.LEFT)
    })

    expect(saved).toBe(1)
    expect(closed).toBe(1)
    cleanup()
  })

  it("uses the configured save key instead of ctrl+s", async () => {
    const { keymap, host, cleanup } = setupKeymap()
    let saved = 0
    const { renderOnce } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <YamlEditorOverlay
            visible
            filePath={filePath}
            requestName="get-users"
            saveKey="ctrl+x"
            onSaved={() => saved++}
            onClose={() => {}}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 100, height: 30 },
    )
    await loadEditor(renderOnce)

    await act(async () => {
      host.press("s", { ctrl: true })
      await new Promise((resolve) => setTimeout(resolve, 20))
    })
    expect(saved).toBe(0)

    await act(async () => {
      host.press("x", { ctrl: true })
      await new Promise((resolve) => setTimeout(resolve, 20))
    })
    expect(saved).toBe(1)
    cleanup()
  })

  it("toggles a YAML fold from its gutter icon", async () => {
    await writeFile(
      filePath,
      "headers:\n  accept: application/json\n  x-id: 1\n",
    )
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame, mockMouse } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <YamlEditorOverlay
            visible
            filePath={filePath}
            requestName="get-users"
            saveKey="ctrl+s"
            onSaved={() => {}}
            onClose={() => {}}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 100, height: 30 },
    )
    await loadEditor(renderOnce)
    const [row, rowIndex] = await waitForRow(
      captureCharFrame,
      renderOnce,
      (line) => line.includes("▼") && line.includes("headers:"),
    )

    await act(async () => {
      await mockMouse.click(row.indexOf("▼"), rowIndex, MouseButtons.LEFT)
    })
    await renderOnce()
    expect(captureCharFrame()).not.toContain("accept: application/json")
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
            filePath={filePath}
            requestName="get-users"
            saveKey="ctrl+s"
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
            filePath={filePath}
            requestName="get-users"
            saveKey="ctrl+s"
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
            filePath={filePath}
            requestName="get-users"
            saveKey="ctrl+s"
            onSaved={() => {}}
            onClose={() => {}}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 100, height: 30 },
    )
    await loadEditor(renderOnce)
    const frame = captureCharFrame()
    expect(frame).toMatch(/\^s.*save.*esc.*close/)
    cleanup()
  })

  it("rejects invalid YAML on save", async () => {
    const invalidYaml = "name: test\nmethod: GET\nurl: [broken\n"
    await writeFile(filePath, invalidYaml)
    const { keymap, host, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <YamlEditorOverlay
            visible
            filePath={filePath}
            requestName="get-users"
            saveKey="ctrl+s"
            onSaved={() => {}}
            onClose={() => {}}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 100, height: 30 },
    )
    await loadEditor(renderOnce)

    await act(async () => {
      host.press("s", { ctrl: true })
      await new Promise((resolve) => setTimeout(resolve, 20))
    })
    await renderOnce()

    const frame = captureCharFrame()
    expect(frame).toContain("! Invalid request YAML for get-users.yml")
    expect(frame).toContain("Line 4, Col 1:")
    expect(frame).not.toContain("Save error:")
    expect(await readFile(filePath, "utf8")).toBe(invalidYaml)
    cleanup()
  })

  it("shows the shared request validation notice with the filename", async () => {
    await writeFile(
      filePath,
      "name: test\nmethod: GET\nurl: https://example.com\ntimeout: nope\n",
    )
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <YamlEditorOverlay
            visible
            filePath={filePath}
            requestName="get-users"
            saveKey="ctrl+s"
            onSaved={() => {}}
            onClose={() => {}}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 100, height: 30 },
    )
    await loadEditor(renderOnce)

    const frame = captureCharFrame()
    expect(frame).toContain("! Invalid request YAML for get-users.yml")
    expect(frame).toContain('Line 4: "timeout" must be a finite number')
    expect(frame).not.toContain("lang.parseRequest:")
    cleanup()
  })

  it("shows the shared folder validation notice", async () => {
    const folderPath = join(testDir, "folder.yml")
    await writeFile(folderPath, "unknown: true\n")
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <YamlEditorOverlay
            visible
            filePath={folderPath}
            requestName="auth"
            kind="folder"
            saveKey="ctrl+s"
            onSaved={() => {}}
            onClose={() => {}}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 100, height: 30 },
    )
    await loadEditor(renderOnce)

    const frame = captureCharFrame()
    expect(frame).toContain("! Invalid folder YAML for auth/folder.yml")
    expect(frame).toContain('Line 1: unknown field "unknown"')
    expect(frame).not.toContain("lang.parseFolder:")
    cleanup()
  })
})

describe("ConfirmOverlay", () => {
  it("renders confirm and cancel as shortcut text not brackets", async () => {
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <ConfirmOverlay visible message="Save changes to test?" />
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
          <ConfirmOverlay visible message="Save changes to test?" />
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
