import { expect, it, spyOn } from "bun:test"
import { act, type ComponentProps } from "react"
import { useRenderer } from "@opentui/react"
import { KeymapProvider } from "@opentui/keymap/react"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as config from "../../src/hooks/useConfig"
import { App } from "../../src/ui/App"
import * as overlays from "../../src/ui/AppOverlays"
import { RendererProvider } from "../../src/ui/RendererContext"
import { takeToastMessage } from "../../src/ui/Toast"
import { bindingDefaults } from "../../src/ui/keybind"
import { createTestRender, waitForHookState } from "../testRender"
import { setupKeymap } from "./_helpers"

it("keeps OpenAPI warnings visible and available after refreshing the current collection", async () => {
  const dir = await mkdtemp(join(tmpdir(), "noodle-import-ui-"))
  const source = join(dir, "api.json")
  const { keymap, host, cleanup } = setupKeymap()
  const testRender = createTestRender()
  let render: Awaited<ReturnType<typeof testRender>> | undefined
  let modal!: ComponentProps<typeof overlays.AppOverlays>
  const appOverlays = overlays.AppOverlays
  const overlaySpy = spyOn(overlays, "AppOverlays").mockImplementation(
    (props) => {
      modal = props
      return appOverlays(props)
    },
  )
  const configSpy = spyOn(config, "useConfig").mockReturnValue({
    config: {
      collections: [dir],
      theme: "noodle",
      layout: "stacked",
      confirm_undo_all: false,
    },
    updateConfig: () => {},
  })
  function Harness() {
    const renderer = useRenderer()
    return (
      <RendererProvider renderer={renderer}>
        <App
          collectionDir={dir}
          mode="collection"
          envList={[]}
          initialSettings={{ cookies: { enabled: false } }}
          systemProxy={{ bypass: [] }}
          keybinds={bindingDefaults()}
        />
      </RendererProvider>
    )
  }
  try {
    await writeFile(join(dir, "settings.yml"), "cookies: { enabled: false }\n")
    await writeFile(
      source,
      JSON.stringify({
        openapi: "3.1.0",
        paths: {
          "/pets": {
            get: { summary: "List pets", parameters: [{ $ref: "./missing" }] },
          },
        },
      }),
    )
    render = await act(async () =>
      testRender(
        <KeymapProvider keymap={keymap}>
          <Harness />
        </KeymapProvider>,
        { width: 90, height: 26 },
      ),
    )
    await act(async () => modal.overlays.setImportCollectionVisible(true))
    const handle = modal.overlays.importCollectionRef.current!
    spyOn(handle, "confirm").mockReturnValue({
      source,
      destination: "current",
      parentDir: dir,
    })
    await act(async () => modal.importCollectionActions.confirm())
    await waitForHookState(render, () =>
      render!.captureCharFrame().includes("GET /pets"),
    )
    expect(modal.overlays.activeOverlay).toBe("notification")
    expect(takeToastMessage()).toContain("parameters")
    await act(async () => host.press("escape"))
    await waitForHookState(render, () =>
      render!.captureCharFrame().includes("List pets"),
    )
    expect(modal.overlays.notificationMessage).toBeNull()
  } finally {
    if (render) await act(async () => render!.renderer.destroy())
    configSpy.mockRestore()
    overlaySpy.mockRestore()
    cleanup()
    await rm(dir, { recursive: true, force: true })
  }
})
