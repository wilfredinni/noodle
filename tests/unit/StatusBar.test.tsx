import { describe, expect, it } from "bun:test"
import { testRender } from "@opentui/react/test-utils"
import { ThemeProvider } from "../../src/ui/theme"
import { StatusBar } from "../../src/ui/StatusBar"
import { bindingDefaults } from "../../src/ui/keybind"

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
          kb={bindingDefaults()}
        />
      </ThemeProvider>,
      { width: 100, height: 3 },
    )

    await renderOnce()
    const frame = captureCharFrame()

    expect(frame).toContain("dev")
  })

  it("renders dirty indicator when modified", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <StatusBar
          method="GET"
          url="/users"
          isDirty={true}
          sendState={{ status: "idle" }}
          envLabel="dev"
          saveState={{ kind: "idle" }}
          kb={bindingDefaults()}
        />
      </ThemeProvider>,
      { width: 100, height: 3 },
    )

    await renderOnce()
    const frame = captureCharFrame()

    expect(frame).toContain("●")
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
          kb={bindingDefaults()}
          focus="sidebar"
          collectionMode="collection"
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
          kb={bindingDefaults()}
          focus="sidebar"
          collectionMode="collection"
          overlayActive={true}
        />
      </ThemeProvider>,
      { width: 100, height: 3 },
    )

    await renderOnce()
    const frame = captureCharFrame()

    expect(frame).toContain("dev")
  })
})
