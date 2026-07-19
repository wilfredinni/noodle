import { describe, expect, it, spyOn } from "bun:test"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import { KeymapProvider } from "@opentui/keymap/react"
import type { CliRenderer } from "@opentui/core"
import { ThemeProvider } from "../../src/ui/theme"
import { RendererProvider } from "../../src/ui/RendererContext"
import { CodeGeneratorOverlay } from "../../src/ui/overlays/CodeGeneratorOverlay"
import * as clipboard from "../../src/ui/clipboard"
import { setupKeymap } from "./_helpers"

const baseRequest = {
  id: "users",
  name: "Users",
  method: "GET" as const,
  url: "https://api.example.com/users",
  timeout: 0,
  headers: {},
  params: [],
}

describe("CodeGeneratorOverlay", () => {
  it("renders a cURL preview by default", async () => {
    const { keymap, cleanup } = setupKeymap()
    const render = await testRender(
      <KeymapProvider keymap={keymap}>
        <RendererProvider
          renderer={
            { copyToClipboardOSC52: () => true } as unknown as CliRenderer
          }
        >
          <ThemeProvider activeIndex={0} previewIndex={null}>
            <CodeGeneratorOverlay
              visible
              request={baseRequest}
              onClose={() => {}}
            />
          </ThemeProvider>
        </RendererProvider>
      </KeymapProvider>,
      { width: 100, height: 32 },
    )

    await render.renderOnce()
    const frame = render.captureCharFrame()
    expect(frame).toContain("Generate code")
    expect(frame).toContain("Shell")
    expect(frame).toContain("curl")
    cleanup()
  })

  it("shows the interpolate variables toggle in the bottom bar", async () => {
    const { keymap, cleanup } = setupKeymap()
    const render = await testRender(
      <KeymapProvider keymap={keymap}>
        <RendererProvider renderer={{} as unknown as CliRenderer}>
          <ThemeProvider activeIndex={0} previewIndex={null}>
            <CodeGeneratorOverlay
              visible
              request={baseRequest}
              onClose={() => {}}
            />
          </ThemeProvider>
        </RendererProvider>
      </KeymapProvider>,
      { width: 100, height: 32 },
    )
    await render.renderOnce()
    const frame = render.captureCharFrame()
    expect(frame).toContain("interpolate")
    cleanup()
  })

  it("shows env name in the bottom bar when provided", async () => {
    const { keymap, cleanup } = setupKeymap()
    const render = await testRender(
      <KeymapProvider keymap={keymap}>
        <RendererProvider renderer={{} as unknown as CliRenderer}>
          <ThemeProvider activeIndex={0} previewIndex={null}>
            <CodeGeneratorOverlay
              visible
              request={baseRequest}
              envName="staging"
              onClose={() => {}}
            />
          </ThemeProvider>
        </RendererProvider>
      </KeymapProvider>,
      { width: 100, height: 32 },
    )
    await render.renderOnce()
    const frame = render.captureCharFrame()
    expect(frame).toContain("env:staging")
    cleanup()
  })

  it("keeps the Select menu above the code preview", async () => {
    const { keymap, host, cleanup } = setupKeymap()
    const render = await testRender(
      <KeymapProvider keymap={keymap}>
        <RendererProvider renderer={{} as unknown as CliRenderer}>
          <ThemeProvider activeIndex={0} previewIndex={null}>
            <CodeGeneratorOverlay
              visible
              request={baseRequest}
              onClose={() => {}}
            />
          </ThemeProvider>
        </RendererProvider>
      </KeymapProvider>,
      { width: 100, height: 32 },
    )
    await render.renderOnce()
    await act(async () => host.press("return"))
    await render.renderOnce()
    const frame = render.captureCharFrame()
    expect(frame).toContain("Clojure")
    cleanup()
  })

  it("consumes modal keys before background handlers", async () => {
    const { keymap, host, cleanup } = setupKeymap()
    const backgroundKeys: string[] = []
    const disposeBackground = keymap.intercept(
      "key",
      (ctx) => {
        backgroundKeys.push(ctx.event.name)
      },
      { priority: 0 },
    )
    const copySpy = spyOn(clipboard, "copyToClipboard").mockReturnValue(true)
    const render = await testRender(
      <KeymapProvider keymap={keymap}>
        <RendererProvider renderer={{} as unknown as CliRenderer}>
          <ThemeProvider activeIndex={0} previewIndex={null}>
            <CodeGeneratorOverlay
              visible
              request={baseRequest}
              env={{ name: "staging", vars: {} }}
              onClose={() => {}}
            />
          </ThemeProvider>
        </RendererProvider>
      </KeymapProvider>,
      { width: 100, height: 32 },
    )

    await render.renderOnce()
    await act(async () => {
      host.press("i")
      host.press("e")
      host.press("c")
    })

    expect(backgroundKeys).toEqual([])
    expect(copySpy).toHaveBeenCalled()
    disposeBackground()
    copySpy.mockRestore()
    cleanup()
  })
})
