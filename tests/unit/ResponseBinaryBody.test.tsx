import { describe, expect, it, mock } from "bun:test"
import { act, useState, type ComponentProps } from "react"
import { extend } from "@opentui/react"
import { KeymapProvider } from "@opentui/keymap/react"
import { createTestKeymap } from "@opentui/keymap/testing"
import { createTestRender } from "../testRender"
import { ResponsePane } from "../../src/ui/ResponsePane"
import { ResponseImageRenderable } from "../../src/ui/ResponseBinaryBody"
import { ResponseFileContext } from "../../src/ui/responseFileContext"
import { ThemeProvider } from "../../src/ui/theme"
import { TimelineDetailOverlay } from "../../src/ui/overlays/TimelineDetailOverlay"
import type { Response } from "../../src/schema"
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
async function mount(initial: Response) {
  const raw = createTestKeymap()
  const controller = { current: null as ResponseQueryController | null }
  let replace!: (value: Response) => void
  let select!: (tab: "body" | "headers") => void
  const save = mock(() => true)
  function Harness() {
    const [value, setValue] = useState(initial)
    const [tab, setTab] = useState<"body" | "headers">("body")
    replace = setValue
    select = setTab
    return (
      <KeymapProvider
        keymap={
          raw.keymap as unknown as ComponentProps<
            typeof KeymapProvider
          >["keymap"]
        }
      >
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <ResponseFileContext.Provider value={{ save, open: () => true }}>
            <ResponsePane
              state={{ status: "done", response: value }}
              requestName="File"
              initialTab={tab}
              focused
              responseQueryRef={controller}
            />
          </ResponseFileContext.Provider>
        </ThemeProvider>
      </KeymapProvider>
    )
  }
  const setup = await act(async () =>
    testRender(<Harness />, { width: 80, height: 22 }),
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
    save,
    render,
    image,
    host: raw.host,
    keymap: raw.keymap,
  }
}
describe("binary response views", () => {
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
