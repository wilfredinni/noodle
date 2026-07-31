import { describe, expect, it } from "bun:test"
import { testRender } from "@opentui/react/test-utils"
import { ThemeProvider } from "../../src/ui/theme"
import { StatusBar } from "../../src/ui/StatusBar"
import { bindingDefaults } from "../../src/ui/keybind"
import { getKeybindingHints } from "../../src/ui/keybindingHints"
import type { HintSegment } from "../../src/ui/keybindingHints"

const kb = bindingDefaults()
const emptyHints: HintSegment[] = []

function sidebarHints(): HintSegment[] {
  return getKeybindingHints({
    view: "main",
    focus: "sidebar",
    paneMode: "base",
    collectionMode: "collection",
    overlayActive: false,
    jumpMode: false,
    sendState: { status: "idle" },
    keybinds: kb,
  }).footer
}

describe("StatusBar component", () => {
  it("renders environment label", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <StatusBar
          method="GET"
          url="/users"
          isDirty={false}
          sendState={{ status: "idle" }}
          envLabel="dev"
          saveState={{ kind: "idle" }}
          kb={kb}
          footerHints={emptyHints}
        />
      </ThemeProvider>,
      { width: 100, height: 3 },
    )

    await renderOnce()
    const frame = captureCharFrame()

    expect(frame).toContain("dev")
  })

  it("does not append a dirty marker to environment", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <StatusBar
          method="GET"
          url="/users"
          isDirty={true}
          sendState={{ status: "idle" }}
          envLabel="dev"
          saveState={{ kind: "idle" }}
          kb={kb}
          footerHints={emptyHints}
        />
      </ThemeProvider>,
      { width: 100, height: 3 },
    )

    await renderOnce()
    const frame = captureCharFrame()

    expect(frame).not.toContain("dev •")
  })

  it("renders contextual shortcuts when focused on sidebar", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <StatusBar
          method="GET"
          url="/users"
          isDirty={false}
          sendState={{ status: "idle" }}
          envLabel="dev"
          saveState={{ kind: "idle" }}
          kb={kb}
          collectionMode="collection"
          footerHints={sidebarHints()}
        />
      </ThemeProvider>,
      { width: 100, height: 3 },
    )

    await renderOnce()
    const frame = captureCharFrame()

    expect(frame).toContain("save")
    expect(frame).toContain("new")
    expect(frame).toContain("new folder")
    expect(frame).toContain("delete")
  })

  it("returns empty contextual shortcuts when overlay is active", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <StatusBar
          method="GET"
          url="/users"
          isDirty={false}
          sendState={{ status: "idle" }}
          envLabel="dev"
          saveState={{ kind: "idle" }}
          kb={kb}
          collectionMode="collection"
          overlayActive={true}
          footerHints={emptyHints}
        />
      </ThemeProvider>,
      { width: 100, height: 3 },
    )

    await renderOnce()
    const frame = captureCharFrame()

    expect(frame).toContain("dev")
  })
})
