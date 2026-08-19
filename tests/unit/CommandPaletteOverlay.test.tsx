import { describe, it, expect } from "bun:test"
import { act } from "react"
import { createTestRender } from "../testRender"
import { KeymapProvider } from "@opentui/keymap/react"
import { ThemeProvider } from "../../src/ui/theme"
import {
  CommandPaletteOverlay,
  type CommandItem,
} from "../../src/ui/overlays/CommandPaletteOverlay"
import { setupKeymap } from "./_helpers"

const testRender = createTestRender()

const testCommands: CommandItem[] = [
  { id: "a.send", label: "Send Request", section: "Actions", run: () => true },
  { id: "b.save", label: "Save Request", section: "Actions", run: () => true },
  {
    id: "c.new",
    label: "New Request",
    section: "Create",
    keybinding: "^N",
    run: () => true,
  },
  {
    id: "d.layout",
    label: "Toggle Layout",
    section: "View",
    keybinding: "^L",
    run: () => true,
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
      { id: "a", label: "Alpha", section: "Sec", run: () => true },
      { id: "b", label: "Beta", section: "Sec", run: () => true },
      { id: "c", label: "Gamma", section: "Sec", run: () => true },
    ]
    const { renderOnce, captureCharFrame, mockInput } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <CommandPaletteOverlay visible commands={commands} onClose={noop} />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 80, height: 20 },
    )
    await renderOnce()
    let frame = captureCharFrame()
    expect(frame).toContain("Alpha")
    expect(frame).toContain("Beta")
    expect(frame).toContain("Gamma")

    // Type "al" to filter — use waitForFrame since typeText is async
    await act(async () => {
      await mockInput.typeText("al")
    })
    await renderOnce()
    await renderOnce()
    frame = captureCharFrame()
    expect(frame).toContain("Alpha")
    expect(frame).not.toContain("Beta")
    expect(frame).not.toContain("Gamma")
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
          return true
        },
      },
      {
        id: "b",
        label: "Beta",
        section: "Sec",
        run: () => {
          selected = "ran-b"
          return true
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
    await act(async () => host.press("return"))
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
    await act(async () => host.press("escape"))
    expect(closed).toBe(true)
    cleanup()
  })

  it("does not close palette when command returns false", async () => {
    const { keymap, host, cleanup } = setupKeymap()
    let closed = false

    const commands: CommandItem[] = [
      {
        id: "noop",
        label: "No-op Command",
        section: "Sec",
        run: () => false,
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
    await act(async () => host.press("return"))
    expect(closed).toBe(false)
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
              { id: "a", label: "Alpha", section: "Sec", run: () => true },
              {
                id: "b",
                label: "Beta",
                section: "Sec",
                run: () => {
                  ran = "beta"
                  return true
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
    await act(async () => host.press("down"))
    await act(async () => host.press("return"))
    expect(ran!).toBe("beta")
    cleanup()
  })

  it("navigates to second item then first on return works", async () => {
    const { keymap, host, cleanup } = setupKeymap()
    let ran: string | null = null

    const { renderOnce } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <CommandPaletteOverlay
            visible
            commands={[
              { id: "a", label: "Alpha", section: "Sec", run: () => true },
              {
                id: "b",
                label: "Beta",
                section: "Sec",
                run: () => {
                  ran = "beta"
                  return true
                },
              },
              { id: "c", label: "Gamma", section: "Sec", run: () => true },
            ]}
            onClose={noop}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 80, height: 20 },
    )
    await renderOnce()
    await act(async () => host.press("down"))
    await act(async () => host.press("return"))
    expect(ran!).toBe("beta")
    cleanup()
  })

  it("down twice then return selects third item", async () => {
    const { keymap, host, cleanup } = setupKeymap()
    let ran: string | null = null

    const { renderOnce } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <CommandPaletteOverlay
            visible
            commands={[
              { id: "a", label: "Alpha", section: "Sec", run: () => true },
              { id: "b", label: "Beta", section: "Sec", run: () => true },
              {
                id: "c",
                label: "Gamma",
                section: "Sec",
                run: () => {
                  ran = "gamma"
                  return true
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
    await act(async () => host.press("down"))
    await act(async () => host.press("down"))
    await act(async () => host.press("return"))
    expect(ran!).toBe("gamma")
    cleanup()
  })

  it("navigates across section headers to second section", async () => {
    const { keymap, host, cleanup } = setupKeymap()
    let ran: string | null = null

    const { renderOnce } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <CommandPaletteOverlay
            visible
            commands={[
              { id: "a", label: "Alpha", section: "SecA", run: () => true },
              { id: "b", label: "Beta", section: "SecB", run: () => true },
              {
                id: "c",
                label: "Gamma",
                section: "SecB",
                run: () => {
                  ran = "gamma"
                  return true
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
    await act(async () => host.press("down"))
    await act(async () => host.press("down"))
    await act(async () => host.press("return"))
    expect(ran!).toBe("gamma")
    cleanup()
  })

  it("up arrow wraps from first command to last", async () => {
    const { keymap, host, cleanup } = setupKeymap()
    let ran: string | null = null

    const { renderOnce } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <CommandPaletteOverlay
            visible
            commands={[
              { id: "a", label: "Alpha", section: "Sec", run: () => true },
              { id: "b", label: "Beta", section: "Sec", run: () => true },
              {
                id: "c",
                label: "Gamma",
                section: "Sec",
                run: () => {
                  ran = "gamma"
                  return true
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
    await act(async () => host.press("up"))
    await act(async () => host.press("return"))
    expect(ran!).toBe("gamma")
    cleanup()
  })
})
