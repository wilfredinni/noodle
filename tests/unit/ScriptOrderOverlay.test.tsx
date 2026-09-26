import { describe, expect, it } from "bun:test"
import { act } from "react"
import { KeymapProvider } from "@opentui/keymap/react"
import type { ScrollBoxRenderable } from "@opentui/core"
import { createTestRender } from "../testRender"
import { setupKeymap } from "./_helpers"
import { ThemeProvider } from "../../src/ui/theme"
import {
  ScriptOrderOverlay,
  type ScriptOrder,
} from "../../src/ui/overlays/ScriptOrderOverlay"

const testRender = createTestRender()

async function mount(order: ScriptOrder, width = 90, height = 24) {
  const { keymap, host } = setupKeymap()
  let closed = false
  const h = await testRender(
    <KeymapProvider keymap={keymap}>
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <ScriptOrderOverlay order={order} onClose={() => (closed = true)} />
      </ThemeProvider>
    </KeymapProvider>,
    { width, height },
  )
  const frame = async () => {
    await act(async () => h.renderOnce())
    await act(async () => h.renderOnce())
    return h.captureCharFrame()
  }
  await frame()
  return {
    ...h,
    frame,
    host,
    closed: () => closed,
    scroll: () =>
      h.renderer.root.findDescendantById(
        "script-order-details",
      ) as ScrollBoxRenderable,
    row: (index: number) =>
      h.renderer.root.findDescendantById(`script-reference-${index}`)!,
  }
}

describe("ScriptOrderOverlay", () => {
  it("uses available width for single-line rows and truncates only after shrinking", async () => {
    const order: ScriptOrder = {
      phase: "pre",
      entries: [
        {
          label: "Folder: scripting-data/users/nested",
          detail: "Inline",
          current: false,
        },
        {
          label: "Folder: scripting-data/users/nested/deeper",
          detail: "./external-scripts/prepare-user-with-long-name.js",
          current: false,
        },
        { label: "This request", detail: "Inline", current: true },
      ],
    }
    const h = await mount(order, 120)
    const wide = await h.frame()
    expect(h.row(0).x - h.scroll().parent!.x).toBe(5)
    expect(
      wide
        .split("\n")
        .find((line) => line.includes("Execution order"))!
        .indexOf("Execution order"),
    ).toBe(h.row(0).x)
    for (const [index, entry] of order.entries.entries()) {
      expect(h.row(index).height).toBe(1)
      expect(wide.split("\n")[h.row(index).y]).toContain(entry.label)
      expect(wide.split("\n")[h.row(index).y]).toContain(entry.detail)
    }
    expect(wide).not.toMatch(/[┌┐└┘─│]/)
    expect(h.scroll().scrollHeight).toBeLessThanOrEqual(
      h.scroll().viewport.height,
    )
    await act(async () => h.resize(40, 12))
    const narrow = await h.frame()
    expect(narrow).toContain("...")
    expect(narrow.split("\n")[h.row(0).y]).toContain("Inline")
    for (let i = 0; i < order.entries.length; i++) {
      expect(h.row(i).height).toBe(1)
      expect(h.row(i).x + h.row(i).width).toBeLessThanOrEqual(40)
    }
    expect(h.scroll().scrollWidth).toBe(h.scroll().viewport.width)
    await act(async () => h.resize(120, 24))
    expect(await h.frame()).toContain(order.entries[1]!.detail)
  })

  it("keeps long lists scrollable and the close action visible in short terminals", async () => {
    const h = await mount(
      {
        phase: "tests",
        entries: Array.from({ length: 30 }, (_, index) => ({
          label: index === 29 ? "This request" : `Folder: parent-${index}`,
          detail: "Inline",
          current: index === 29,
        })),
      },
      30,
      7,
    )
    expect(h.scroll().scrollHeight).toBeGreaterThan(h.scroll().viewport.height)
    expect(await h.frame()).toContain("esc")
    await act(async () => h.host.press("end"))
    expect(await h.frame()).toContain("This request")
    expect(h.scroll().y + h.scroll().height).toBeLessThanOrEqual(7)
    await act(async () => h.host.press("home"))
    await h.frame()
    expect(h.scroll().scrollTop).toBe(0)
    await act(async () => h.host.press("escape"))
    expect(h.closed()).toBe(true)
  })
})
