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
  CommandPaletteOverlay,
  type CommandItem,
} from "../../src/ui/CommandPaletteOverlay"

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

const testCommands: CommandItem[] = [
  { id: "a.send", label: "Send Request", section: "Actions", run: () => {} },
  { id: "b.save", label: "Save Request", section: "Actions", run: () => {} },
  {
    id: "c.new",
    label: "New Request",
    section: "Create",
    keybinding: "^N",
    run: () => {},
  },
  {
    id: "d.layout",
    label: "Toggle Layout",
    section: "View",
    keybinding: "^L",
    run: () => {},
  },
]

function noop() {}

describe("CommandPaletteOverlay", () => {
  it("renders title and placeholder", async () => {
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <CommandPaletteOverlay
            visible
            commands={testCommands}
            onClose={noop}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 80, height: 20 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("Commands")
    expect(frame).toContain("Type a command...")
    cleanup()
  })

  it("renders all command labels", async () => {
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <CommandPaletteOverlay
            visible
            commands={testCommands}
            onClose={noop}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 80, height: 20 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("Send Request")
    expect(frame).toContain("Save Request")
    expect(frame).toContain("New Request")
    expect(frame).toContain("Toggle Layout")
    cleanup()
  })

  it("renders section labels", async () => {
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <CommandPaletteOverlay
            visible
            commands={testCommands}
            onClose={noop}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 80, height: 20 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("Actions")
    expect(frame).toContain("Create")
    expect(frame).toContain("View")
    cleanup()
  })

  it("renders keybinding hints when provided", async () => {
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <CommandPaletteOverlay
            visible
            commands={testCommands}
            onClose={noop}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 80, height: 20 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("^N")
    expect(frame).toContain("^L")
    cleanup()
  })

  it("returns null when not visible", async () => {
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <CommandPaletteOverlay
            visible={false}
            commands={testCommands}
            onClose={noop}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 80, height: 20 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).not.toContain("Commands")
    expect(frame).not.toContain("Send Request")
    cleanup()
  })

  it("filters commands by label via search input", async () => {
    const { keymap, cleanup } = setupKeymap()
    const commands: CommandItem[] = [
      { id: "a", label: "Alpha", section: "Sec", run: () => {} },
      { id: "b", label: "Beta", section: "Sec", run: () => {} },
      { id: "c", label: "Gamma", section: "Sec", run: () => {} },
    ]
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <CommandPaletteOverlay visible commands={commands} onClose={noop} />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 80, height: 20 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("Alpha")
    expect(frame).toContain("Beta")
    expect(frame).toContain("Gamma")
    cleanup()
  })

  it("calls onSelect then onClose when enter is pressed", async () => {
    const { keymap, host, cleanup } = setupKeymap()
    let selected: string | null = null
    let closed = false

    const commands: CommandItem[] = [
      {
        id: "a",
        label: "Alpha",
        section: "Sec",
        run: () => {
          selected = "ran-a"
        },
      },
      {
        id: "b",
        label: "Beta",
        section: "Sec",
        run: () => {
          selected = "ran-b"
        },
      },
    ]

    const { renderOnce } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <CommandPaletteOverlay
            visible
            commands={commands}
            onClose={() => {
              closed = true
            }}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 80, height: 20 },
    )
    await renderOnce()
    host.press("return")
    expect(selected!).toBe("ran-a")
    expect(closed).toBe(true)
    cleanup()
  })

  it("calls onClose when escape is pressed", async () => {
    const { keymap, host, cleanup } = setupKeymap()
    let closed = false

    const { renderOnce } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <CommandPaletteOverlay
            visible
            commands={testCommands}
            onClose={() => {
              closed = true
            }}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 80, height: 20 },
    )
    await renderOnce()
    host.press("escape")
    expect(closed).toBe(true)
    cleanup()
  })

  it("down arrow navigates to next item", async () => {
    const { keymap, host, cleanup } = setupKeymap()
    let ran: string | null = null

    const { renderOnce } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <CommandPaletteOverlay
            visible
            commands={[
              { id: "a", label: "Alpha", section: "Sec", run: () => {} },
              {
                id: "b",
                label: "Beta",
                section: "Sec",
                run: () => {
                  ran = "beta"
                },
              },
            ]}
            onClose={noop}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 80, height: 20 },
    )
    await renderOnce()
    host.press("down")
    host.press("return")
    expect(ran!).toBe("beta")
    cleanup()
  })
})
