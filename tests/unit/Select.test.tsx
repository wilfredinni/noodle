import { describe, it, expect } from "bun:test"
import { act } from "react"
import { testRender } from "@opentui/react/test-utils"
import { KeymapProvider } from "@opentui/keymap/react"
import { ThemeProvider } from "../../src/ui/theme"
import { Select, type SelectItem } from "../../src/ui/Select"
import { setupKeymap } from "./_helpers"

const testItems: SelectItem[] = [
  { id: "get", label: "GET" },
  { id: "post", label: "POST" },
  { id: "put", label: "PUT" },
]

describe("Select", () => {
  it("renders placeholder when no value selected", async () => {
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <Select items={testItems} placeholder="Choose..." />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 40, height: 10 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("Choose...")
    cleanup()
  })

  it("renders selected item label in trigger", async () => {
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <Select items={testItems} value="post" />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 40, height: 10 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("POST")
    expect(frame).not.toContain("GET")
    cleanup()
  })

  it("opens dropdown on Enter when focused", async () => {
    const { keymap, host, cleanup } = setupKeymap()
    let open = false
    const { renderOnce } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <Select
            items={testItems}
            focused
            onOpenChange={(v) => {
              open = v
            }}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 40, height: 20 },
    )
    await renderOnce()
    expect(open).toBe(false)

    act(() => {
      host.press("return")
    })
    await renderOnce()
    expect(open).toBe(true)
    cleanup()
  })

  it("closes dropdown on Escape", async () => {
    const { keymap, host, cleanup } = setupKeymap()
    let open = false
    const { renderOnce } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <Select
            items={testItems}
            focused
            onOpenChange={(v) => {
              open = v
            }}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 40, height: 20 },
    )
    await renderOnce()

    act(() => {
      host.press("return")
    })
    await renderOnce()
    expect(open).toBe(true)

    act(() => {
      host.press("escape")
    })
    await renderOnce()
    expect(open).toBe(false)
    cleanup()
  })

  it("selects item on Enter and calls onChange", async () => {
    const { keymap, host, cleanup } = setupKeymap()
    let selected = ""
    const { renderOnce } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <Select
            items={testItems}
            focused
            onChange={(id) => {
              selected = id
            }}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 40, height: 20 },
    )
    await renderOnce()

    act(() => {
      host.press("return")
    })
    await renderOnce()

    act(() => {
      host.press("down")
    })
    await renderOnce()

    act(() => {
      host.press("return")
    })
    await renderOnce()
    expect(selected).toBe("post")
    cleanup()
  })

  it("does not open when not focused", async () => {
    const { keymap, host, cleanup } = setupKeymap()
    let open = false
    const { renderOnce } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <Select
            items={testItems}
            focused={false}
            onOpenChange={(v) => {
              open = v
            }}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 40, height: 10 },
    )
    await renderOnce()

    act(() => {
      host.press("return")
    })
    await renderOnce()
    expect(open).toBe(false)
    cleanup()
  })

  it("renders items with rich formatted labels", async () => {
    const richItems: SelectItem[] = [
      { id: "a", label: <text fg="#ff0000">Red</text> },
      { id: "b", label: <text fg="#00ff00">Green</text> },
    ]
    const { keymap, host, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <Select items={richItems} focused />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 40, height: 20 },
    )
    await renderOnce()

    act(() => {
      host.press("return")
    })
    await renderOnce()

    const frame = captureCharFrame()
    expect(frame).toContain("Red")
    expect(frame).toContain("Green")
    cleanup()
  })

  it("shows item description in dropdown", async () => {
    const itemsWithDesc: SelectItem[] = [
      { id: "x", label: "Option X", description: "Description X" },
    ]
    const { keymap, host, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <Select items={itemsWithDesc} focused />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 50, height: 20 },
    )
    await renderOnce()

    act(() => {
      host.press("return")
    })
    await renderOnce()

    const frame = captureCharFrame()
    expect(frame).toContain("Description X")
    cleanup()
  })

  it("renders placeholder when selected value not in items", async () => {
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <Select
            items={testItems}
            value="nonexistent"
            placeholder="Pick one"
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 40, height: 10 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("Pick one")
    cleanup()
  })

  it("opens dropdown on Space key when focused", async () => {
    const { keymap, host, cleanup } = setupKeymap()
    let open = false
    const { renderOnce } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <Select
            items={testItems}
            focused
            onOpenChange={(v) => {
              open = v
            }}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 40, height: 20 },
    )
    await renderOnce()
    expect(open).toBe(false)

    act(() => {
      host.press("space")
    })
    await renderOnce()
    expect(open).toBe(true)
    cleanup()
  })

  it("skips disabled items during arrow navigation", async () => {
    const itemsWithDisabled: SelectItem[] = [
      { id: "a", label: "A" },
      { id: "b", label: "B", disabled: true },
      { id: "c", label: "C" },
    ]
    const { keymap, host, cleanup } = setupKeymap()
    let selected = ""
    const { renderOnce } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <Select
            items={itemsWithDisabled}
            value="a"
            focused
            onChange={(id) => {
              selected = id
            }}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 40, height: 20 },
    )
    await renderOnce()

    act(() => {
      host.press("return")
    })
    await renderOnce()

    act(() => {
      host.press("down")
    })
    await renderOnce()

    act(() => {
      host.press("return")
    })
    await renderOnce()
    expect(selected).toBe("c")
    cleanup()
  })

  it("renders with badge mode", async () => {
    const badgeItems: SelectItem[] = [
      { id: "get", label: "GET", color: "primary" },
      { id: "post", label: "POST" },
    ]
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <Select items={badgeItems} value="get" focused badge />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 40, height: 10 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("GET")
    cleanup()
  })

  it("renders dropdown with dropdownAlign right", async () => {
    const { keymap, host, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <Select items={testItems} focused dropdownAlign="right" />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 40, height: 20 },
    )
    await renderOnce()

    act(() => {
      host.press("return")
    })
    await renderOnce()

    const frame = captureCharFrame()
    expect(frame).toContain("GET")
    expect(frame).toContain("POST")
    expect(frame).toContain("PUT")
    cleanup()
  })

  it("does not shrink when placed next to a long input in a row container", async () => {
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <box style={{ flexDirection: "row", width: 30 }}>
            <Select items={testItems} value="get" badge />
            <text style={{ flexGrow: 1 }}>
              https://very-long-domain-name.com/api/v1/resource/endpoint
            </text>
          </box>
        </ThemeProvider>
      </KeymapProvider>,
      { width: 30, height: 5 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("GET")
    expect(frame).toContain("▼")
    cleanup()
  })
})
