import { describe, expect, it, mock, spyOn } from "bun:test"
import { OptimizedBuffer, RGBA, type BoxRenderable } from "@opentui/core"
import { act, useState, type ComponentProps } from "react"
import { extend } from "@opentui/react"
import { KeymapProvider } from "@opentui/keymap/react"
import { createTestKeymap } from "@opentui/keymap/testing"
import { createTestRender } from "../testRender"
import { ResponsePane } from "../../src/ui/ResponsePane"
import { MainView } from "../../src/ui/MainView"
import { useRequestDraft } from "../../src/hooks/useRequestDraft"
import { useEditBrowse } from "../../src/hooks/useEditBrowse"
import { ResponseImageRenderable } from "../../src/ui/ResponseBinaryBody"
import { ResponseFileContext } from "../../src/ui/responseFileContext"
import { contrastOnSecondary, THEMES, ThemeProvider } from "../../src/ui/theme"
import { bindingDefaults, type Keybinds } from "../../src/ui/keybind"
import { TimelineDetailOverlay } from "../../src/ui/overlays/TimelineDetailOverlay"
import type { Request, Response } from "../../src/schema"
import type { ResponseQueryController } from "../../src/ui/responseQuery"
import {
  CodeEditorRenderable,
  CodeEditorScrollBarRenderable,
} from "../../src/ui/editor/CodeEditor"

const testRender = createTestRender()
extend({
  "code-editor": CodeEditorRenderable,
  "code-editor-scrollbar": CodeEditorScrollBarRenderable,
})
// A complete one-pixel GIF exercises native decoding without a remote fixture.
const gif = new Uint8Array(
  Buffer.from(
    "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
    "base64",
  ),
)
const png = new Uint8Array(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  ),
)
const jpeg = new Uint8Array(
  Buffer.from(
    "/9j/wAALCAABAAEBAREA/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/9sAQwACAgICAgIDAgIDBQMDAwUGBQUFBQYIBgYGBgYICggICAgICAoKCgoKCgoKDAwMDAwMDg4ODg4PDw8PDw8PDw8P/90ABAAB/9oACAEBAAA/APwDr//Z",
    "base64",
  ),
)
const webp = new Uint8Array(
  Buffer.from(
    "UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA",
    "base64",
  ),
)
const request: Request = {
  id: "image",
  name: "Modelos imágenes",
  method: "GET",
  url: "https://example.com/image.jpg",
  headers: {},
  params: [],
  auth: { type: "none" },
  timeout: 10_000,
}
const response = (
  bytes: Uint8Array,
  contentType = "application/octet-stream",
): Response =>
  Object.defineProperty(
    {
      status: 200,
      statusText: "OK",
      headers: { "content-type": contentType },
      body: "",
      bodyKind: "binary",
      timeMs: 1,
    },
    "bodyBytes",
    { value: bytes },
  )
async function mount(
  initial: Response | null,
  {
    width = 80,
    height = 22,
    workspaceLayout,
  }: {
    width?: number
    height?: number
    workspaceLayout?: "stacked" | "side-by-side"
  } = {},
) {
  const raw = createTestKeymap()
  const controller = { current: null as ResponseQueryController | null }
  let replace!: (value: Response) => void
  let select!: (tab: "body" | "headers") => void
  let saved!: (path: string) => void
  let split!: (ratio: number) => void
  let bindings!: (keybinds: Keybinds) => void
  let currentRatio = 0.5
  const save = mock(() => true)
  const open = mock(() => true)
  function Harness() {
    const [value, setValue] = useState(initial)
    const [tab, setTab] = useState<"body" | "headers">("body")
    const [savedPath, setSavedPath] = useState<string>()
    const [splitRatio, setSplitRatio] = useState(0.5)
    const [keybinds, setKeybinds] = useState(bindingDefaults)
    const draft = useRequestDraft(request)
    const eb = useEditBrowse(draft.draft, draft)
    replace = setValue
    select = setTab
    saved = setSavedPath
    split = setSplitRatio
    bindings = setKeybinds
    currentRatio = splitRatio
    return (
      <KeymapProvider
        keymap={
          raw.keymap as unknown as ComponentProps<
            typeof KeymapProvider
          >["keymap"]
        }
      >
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <ResponseFileContext.Provider value={{ save, open, savedPath }}>
            {workspaceLayout ? (
              <box width="100%" height="100%" flexDirection="column">
                <text>Header</text>
                <box flexDirection="column" flexGrow={1} paddingX={1}>
                  <MainView
                    collectionDir="/tmp/noodle-binary-response-test"
                    items={[{ type: "request", data: request }]}
                    loading={false}
                    visibleItems={[]}
                    cursorIndex={0}
                    selectedId={request.id}
                    expandedFolders={new Set()}
                    focusedFolderPresent={false}
                    folderDraft={
                      { dirtyPaths: new Set() } as ComponentProps<
                        typeof MainView
                      >["folderDraft"]
                    }
                    folderEb={{} as ComponentProps<typeof MainView>["folderEb"]}
                    keybinds={keybinds}
                    sidebarVisible={false}
                    paneSplitRatio={splitRatio}
                    onPaneSplitRatioChange={setSplitRatio}
                    onInitialize={() => {}}
                    onCreateRequest={() => {}}
                    onCollectionErrorSaved={() => {}}
                    draft={draft}
                    eb={eb}
                    error={null}
                    focus="response"
                    layout={workspaceLayout}
                    expanded={null}
                    activeEnv={null}
                    responseState={
                      value
                        ? { status: "done", response: value }
                        : { status: "idle" }
                    }
                    timelineEntries={[]}
                    onResponseTabChange={() => {}}
                    setSelectOpen={() => {}}
                    urlbarSubFocus="text"
                    urlbarInteractive={false}
                  />
                </box>
                <text>Status bar</text>
              </box>
            ) : (
              <ResponsePane
                keybinds={keybinds}
                state={
                  value
                    ? { status: "done", response: value }
                    : { status: "idle" }
                }
                requestName="File"
                initialTab={tab}
                focused
                responseQueryRef={controller}
              />
            )}
          </ResponseFileContext.Provider>
        </ThemeProvider>
      </KeymapProvider>
    )
  }
  const setup = await act(async () =>
    testRender(<Harness />, { width, height }),
  )
  const image = () =>
    setup.renderer.root.findDescendantById("binary-response-image") as
      | ResponseImageRenderable
      | undefined
  const render = async () => {
    await act(async () => {
      const pending = image()?.loadPromise
      if (pending) await pending
      await setup.renderOnce()
    })
  }
  await render()
  return {
    ...setup,
    controller,
    replace,
    select,
    saved,
    split,
    bindings,
    splitRatio: () => currentRatio,
    save,
    open,
    render,
    image,
    host: raw.host,
    keymap: raw.keymap,
  }
}
describe("binary response views", () => {
  it("separates file buttons and matches modal label and hover colors", async () => {
    const setup = await mount(response(gif))
    const theme = THEMES[0]!
    const label = (value: string) =>
      setup
        .captureSpans()
        .lines.flatMap((line) => line.spans)
        .find((span) => span.text.includes(value))!
    expect(label("Save file").fg.equals(RGBA.fromHex(theme.textMuted))).toBe(
      true,
    )
    expect(
      label("Open in default app").fg.equals(RGBA.fromHex(theme.border)),
    ).toBe(true)
    let rows = setup.captureCharFrame().split("\n")
    let actionRow = rows.findIndex((row) => row.includes("Save file"))
    expect(rows[actionRow]).toContain(
      "^alt+s Save file   ^alt+o Open in default app",
    )
    await act(async () => {
      await setup.mockMouse.click(
        rows[actionRow]!.indexOf("Open in default app"),
        actionRow,
      )
    })
    expect(setup.open).not.toHaveBeenCalled()
    await act(() => setup.saved("/tmp/File.gif"))
    await setup.render()
    expect(
      label("Open in default app").fg.equals(RGBA.fromHex(theme.textMuted)),
    ).toBe(true)
    rows = setup.captureCharFrame().split("\n")
    actionRow = rows.findIndex((row) => row.includes("Save file"))
    await act(async () => {
      await setup.mockMouse.moveTo(0, 0)
      await setup.mockMouse.moveTo(
        rows[actionRow]!.indexOf("Open in default app"),
        actionRow,
      )
    })
    await setup.render()
    expect(
      label("Open in default app").fg.equals(
        RGBA.fromHex(contrastOnSecondary(theme)),
      ),
    ).toBe(true)
    await act(async () => {
      await setup.mockMouse.click(
        rows[actionRow]!.indexOf("Open in default app"),
        actionRow,
      )
    })
    expect(setup.open).toHaveBeenCalledTimes(1)
  })
  it("updates button shortcuts after changing the bindings", async () => {
    const setup = await mount(response(gif), {
      width: 100,
      height: 24,
      workspaceLayout: "stacked",
    })
    expect(setup.captureCharFrame()).toContain("^alt+s Save file")
    expect(setup.captureCharFrame()).toContain("^alt+o Open in default app")
    await act(() =>
      setup.bindings({
        ...bindingDefaults(),
        response_save_file: "alt+s",
        response_open_file: "alt+o",
      }),
    )
    await setup.render()
    expect(setup.captureCharFrame()).toContain("alt+s Save file")
    expect(setup.captureCharFrame()).toContain("alt+o Open in default app")
    expect(setup.captureCharFrame()).not.toContain("^alt+s")
    expect(setup.captureCharFrame()).not.toContain("^alt+o")
  })
  it("keeps Save inside the pane after scheduled shrink and grow frames", async () => {
    const setup = await mount(null, {
      width: 100,
      height: 27,
      workspaceLayout: "stacked",
    })
    await setup.render()
    await act(() => setup.replace(response(jpeg, "image/jpeg")))
    await setup.render()
    await act(async () => setup.flush())
    for (const height of [23, 31, 27]) {
      await act(async () => {
        setup.resize(100, height)
        await setup.flush()
      })
      const container = setup.renderer.root.findDescendantById(
        "request-response-split",
      )!
      const request =
        setup.renderer.root.findDescendantById("request-pane-slot")!
      const response =
        setup.renderer.root.findDescendantById("response-pane-slot")!
      expect(request.height + response.height).toBe(container.height)
      expect(response.screenY + response.height).toBe(
        container.screenY + container.height,
      )
      const rows = setup.captureCharFrame().split("\n")
      const saveRow = rows.findIndex((row) => row.includes("Save file"))
      expect(saveRow).toBeGreaterThan(response.screenY)
      expect(saveRow).toBeLessThan(response.screenY + response.height - 1)
    }
  })
  it.each(["stacked", "side-by-side"] as const)(
    "shows clickable Save file before resizing the actual %s workspace",
    async (workspaceLayout) => {
      const setup = await mount(null, {
        width: 100,
        height: 30,
        workspaceLayout,
      })
      await setup.render()
      await act(() => setup.replace(response(jpeg, "image/jpeg")))
      await setup.render()
      const rows = setup.captureCharFrame().split("\n")
      const saveRow = rows.findIndex((row) => row.includes("Save file"))
      expect(saveRow).toBeGreaterThanOrEqual(0)
      expect(rows.join("\n").split("Save file")).toHaveLength(2)
      const slot = setup.renderer.root.findDescendantById(
        "response-pane-slot",
      ) as BoxRenderable
      expect(saveRow).toBeGreaterThan(slot.screenY)
      expect(saveRow).toBeLessThan(slot.screenY + slot.height - 1)
      const openRow = rows.findIndex((row) =>
        row.includes("Open in default app"),
      )
      expect(openRow).toBeGreaterThan(slot.screenY)
      expect(openRow).toBeLessThan(slot.screenY + slot.height - 1)
      expect(rows[openRow]).toContain("^alt+o Open in default app")
      if (workspaceLayout === "side-by-side")
        expect(openRow).toBeGreaterThan(saveRow)
      const preview = setup.image()!
      expect(preview.screenY + preview.height).toBeLessThanOrEqual(saveRow)
      await act(async () => {
        await setup.mockMouse.click(
          rows[saveRow]!.indexOf("Save file"),
          saveRow,
        )
      })
      expect(setup.save).toHaveBeenCalledTimes(1)
      await act(() => setup.saved("/tmp/Modelos imágenes.jpg"))
      await setup.render()
      expect(setup.captureCharFrame()).toContain("Save file")
      expect(setup.captureCharFrame()).toContain("/tmp/Modelos imágenes.jpg")
      const savedRow = setup
        .captureCharFrame()
        .split("\n")
        .findIndex((row) => row.includes("/tmp/Modelos imágenes.jpg"))
      expect(savedRow).toBeLessThan(slot.screenY + slot.height - 1)
      await act(() => setup.split(0.4))
      await setup.render()
      const handle = setup.renderer.root.findDescendantById(
        "request-response-resize-handle",
      ) as BoxRenderable
      const x = handle.screenX + Math.floor(handle.width / 2)
      const y = handle.screenY + Math.floor(handle.height / 2)
      await act(async () => {
        await setup.mockMouse.click(x, y)
        await setup.mockMouse.click(x, y)
      })
      await setup.render()
      expect(setup.splitRatio()).toBe(0.5)
      const resetRows = setup.captureCharFrame().split("\n")
      const resetSaveRow = resetRows.findIndex((row) =>
        row.includes("Save file"),
      )
      expect(resetSaveRow).toBeGreaterThan(slot.screenY)
      expect(resetSaveRow).toBeLessThan(slot.screenY + slot.height - 1)
      expect(preview.screenY + preview.height).toBeLessThanOrEqual(resetSaveRow)
      expect(resetRows.join("\n")).toContain("/tmp/Modelos imágenes.jpg")
      await act(async () => {
        await setup.mockMouse.click(
          resetRows[resetSaveRow]!.indexOf("Save file"),
          resetSaveRow,
        )
      })
      expect(setup.save).toHaveBeenCalledTimes(2)
    },
  )
  it("keeps image placements off Save file when a response arrives before resizing", async () => {
    const setup = await mount(null, { width: 40, height: 6 })
    const draw = spyOn(OptimizedBuffer.prototype, "drawImage")
    try {
      await act(() => setup.replace(response(png, "image/png")))
      await setup.render()
      const rows = setup.captureCharFrame().split("\n")
      const saveRow = rows.findIndex((row) => row.includes("Save file"))
      expect(saveRow).toBeGreaterThanOrEqual(0)
      expect(saveRow).toBeLessThan(setup.renderer.height - 1)
      for (const [, , y, , height] of draw.mock.calls) {
        expect(y + height).toBeLessThanOrEqual(saveRow)
      }
      await act(async () => {
        await setup.mockMouse.click(
          rows[saveRow]!.indexOf("Save file"),
          saveRow,
        )
      })
      expect(setup.save).toHaveBeenCalledTimes(1)
      draw.mockClear()
      await act(() => setup.renderer.resize(40, 12))
      await setup.render()
      expect(draw).toHaveBeenCalled()
      expect(setup.captureCharFrame()).toContain("Save file")
    } finally {
      draw.mockRestore()
    }
  })
  it("closes an empty text response query when a binary response replaces it", async () => {
    const setup = await mount({
      ...response(new Uint8Array()),
      bodyKind: "text",
    })
    await act(() => {
      setup.controller.current!.open()
    })
    expect(setup.controller.current!.isOpen()).toBe(true)
    await act(() => setup.replace(response(new Uint8Array())))
    await setup.render()
    expect(setup.controller.current!.isOpen()).toBe(false)
    expect(setup.controller.current!.canOpen()).toBe(false)
  })
  it.each([png, jpeg, webp, gif])(
    "previews supported image bytes using the native decoder",
    async (bytes) => {
      const setup = await mount(response(bytes))
      expect(setup.image()?.image?.width).toBe(1)
      expect(setup.image()?.image?.height).toBe(1)
      expect(setup.image()?.fit).toBe("fit")
      expect(setup.image()?.protocol).toBe("auto")
      expect(setup.captureCharFrame()).toContain("Save file")
    },
  )
  it("removes file actions from legacy text responses without original bytes", async () => {
    const setup = await mount({
      ...response(new Uint8Array()),
      body: "Legacy text",
      bodyKind: undefined,
      bodyBytes: undefined,
    })
    expect(setup.captureCharFrame()).toContain("Legacy text")
    expect(setup.captureCharFrame()).not.toContain("Save file")
  })
  it.each([
    ["text/plain", "Normal response", "text"],
    ["application/json", '{"message":"Normal response"}', "text"],
    ["application/json", '{"message":"Normal response"}', undefined],
  ] as const)(
    "keeps file buttons off %s responses with retained bytes",
    async (contentType, body, bodyKind) => {
      const value: Response = Object.defineProperty(
        {
          status: 200,
          statusText: "OK",
          headers: { "content-type": contentType },
          body,
          bodyKind,
          timeMs: 1,
        },
        "bodyBytes",
        { value: new TextEncoder().encode(body) },
      )
      const setup = await mount(value)
      expect(setup.captureCharFrame()).toContain("Normal response")
      expect(setup.captureCharFrame()).not.toContain("Save file")
      expect(setup.captureCharFrame()).not.toContain("Open in default app")
    },
  )
  it("shows a useful file fallback and disables JSON queries and view toggles", async () => {
    const setup = await mount(
      response(new Uint8Array([0, 255]), "application/pdf"),
    )
    expect(setup.captureCharFrame()).toContain("File.pdf")
    expect(setup.captureCharFrame()).toContain(
      "Preview unavailable for this format.",
    )
    expect(setup.captureCharFrame()).toContain("Save file")
    expect(setup.controller.current?.canOpen()).toBe(false)
    expect(setup.controller.current?.open()).toBe(false)
    expect(setup.controller.current?.canToggleView?.()).toBe(false)
  })
  it("previews generic-MIME image bytes, resizes, and disposes images when switching tabs or responses", async () => {
    const setup = await mount(response(gif))
    const image = setup.image()!
    expect(image.image?.width).toBe(1)
    const native = image.image!
    await act(async () => {
      setup.renderer.resize(45, 14)
      await setup.renderOnce()
    })
    expect(image.width).toBeLessThanOrEqual(45)
    await act(() => setup.select("headers"))
    await setup.render()
    expect(image.isDestroyed).toBe(true)
    expect(() => native.info()).toThrow()
    await act(() => setup.select("body"))
    await setup.render()
    expect(setup.image()?.image?.width).toBe(1)
    const third = setup.image()!
    const thirdNative = third.image!
    await act(() => setup.replace(response(png)))
    await setup.render()
    expect(third.isDestroyed).toBe(true)
    expect(() => thirdNative.info()).toThrow()
    expect(setup.image()?.image?.info().format).toBe("png")
    const second = setup.image()!
    await act(() =>
      setup.replace(response(new Uint8Array([0]), "application/pdf")),
    )
    await setup.render()
    expect(second.isDestroyed).toBe(true)
    expect(setup.captureCharFrame()).toContain("File.pdf")
  })
  it("falls back on malformed image data and native dimension-limit errors", async () => {
    const malformed = await mount(
      response(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), "image/png"),
    )
    expect(malformed.captureCharFrame()).toContain("Preview unavailable:")
    expect(malformed.captureCharFrame()).toContain("Save file")
    const oversized = gif.slice()
    oversized[6] = 255
    oversized[7] = 255
    const limited = await mount(response(oversized, "image/gif"))
    expect(limited.captureCharFrame()).toContain("Preview unavailable:")
    expect(Boolean(limited.image())).toBe(false)
  })
  it("does not decode large images until activation and respects overlay isolation", async () => {
    const bytes = new Uint8Array(5 * 1024 * 1024 + 1)
    bytes.set(gif)
    const setup = await mount(response(bytes))
    await act(() => setup.replace(response(bytes.slice())))
    await setup.render()
    expect(Boolean(setup.image())).toBe(false)
    expect(setup.captureCharFrame()).toContain("preview image")
    setup.keymap.setData("app.overlay", "save-response")
    await act(async () => setup.host.press("v"))
    await setup.render()
    expect(Boolean(setup.image())).toBe(false)
    setup.keymap.setData("app.overlay", "none")
    await act(async () => setup.host.press("v"))
    await setup.render()
    expect(setup.image()?.image?.width).toBe(1)
    const native = setup.image()!.image!
    const replacement = response(bytes.slice())
    await act(() => setup.replace(replacement))
    await setup.render()
    expect(Boolean(setup.image())).toBe(false)
    expect(() => native.info()).toThrow()
  })
  it("explains metadata-only history and blocks body actions", async () => {
    const raw = createTestKeymap()
    const copy = mock(() => {})
    const exported = mock(async () => {})
    const setup = await act(async () =>
      testRender(
        <KeymapProvider
          keymap={
            raw.keymap as unknown as ComponentProps<
              typeof KeymapProvider
            >["keymap"]
          }
        >
          <TimelineDetailOverlay
            visible
            initialTab="response"
            entry={{
              timestamp: 1,
              request: {
                id: "file",
                name: "File",
                method: "GET",
                url: "http://localhost/",
                headers: {},
                params: [],
              },
              response: {
                status: 200,
                statusText: "OK",
                headers: { "content-type": "application/pdf" },
                bodyKind: "binary",
                size: 123,
                timeMs: 1,
              },
            }}
            onClose={() => {}}
            onCopyBody={copy}
            onExportBody={exported}
          />
        </KeymapProvider>,
        { width: 80, height: 25 },
      ),
    )
    await act(async () => {
      await setup.renderOnce()
      raw.host.press("b")
      raw.host.press("e")
    })
    expect(setup.captureCharFrame()).toContain("Binary body was not retained")
    expect(copy).not.toHaveBeenCalled()
    expect(exported).not.toHaveBeenCalled()
  })
})
