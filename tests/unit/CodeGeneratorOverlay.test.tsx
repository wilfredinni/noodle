import { describe, expect, it } from "bun:test"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import { KeymapProvider } from "@opentui/keymap/react"
import type { CliRenderer } from "@opentui/core"
import { ThemeProvider } from "../../src/ui/theme"
import { RendererProvider } from "../../src/ui/RendererContext"
import { CodeGeneratorOverlay } from "../../src/ui/overlays/CodeGeneratorOverlay"
import { setupKeymap } from "./_helpers"

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
              request={{
                id: "users",
                name: "Users",
                method: "GET",
                url: "https://api.example.com/users",
                timeout: 0,
                headers: {},
                params: [],
              }}
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
    expect(frame).toContain("cURL")
    expect(frame).toContain("curl \\")
    expect(frame).toContain("--request GET")
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
              request={{
                id: "users",
                name: "Users",
                method: "GET",
                url: "https://api.example.com/users",
                timeout: 0,
                headers: {},
                params: [],
              }}
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
    expect(frame).toContain("JavaScript")
    cleanup()
  })
})
