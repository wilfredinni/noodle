import { describe, expect, it } from "bun:test"
import { testRender } from "@opentui/react/test-utils"
import { createTestKeymap } from "@opentui/keymap/testing"
import {
  registerDefaultKeys,
  registerEnabledFields,
} from "@opentui/keymap/addons"
import { KeymapProvider } from "@opentui/keymap/react"
import type { KeymapProviderProps } from "@opentui/keymap/react"
import { ThemeProvider } from "../../src/ui/theme"
import { RequestFinderOverlay } from "../../src/ui/overlays/RequestFinderOverlay"

function setup() {
  const { keymap, host, cleanup: hostCleanup } = createTestKeymap()
  const disposeEnabled = registerEnabledFields(keymap)
  const disposeKeys = registerDefaultKeys(keymap)
  keymap.setData("app.overlay", "request-finder")
  return {
    keymap: keymap as unknown as KeymapProviderProps["keymap"],
    host,
    cleanup: () => {
      disposeEnabled()
      disposeKeys()
      hostCleanup()
    },
  }
}

const requests = [
  {
    id: "users/get",
    name: "Get User",
    method: "GET" as const,
    url: "https://$API_HOST/users/1",
    headers: {},
    params: [],
    timeout: 0,
  },
]

describe("RequestFinderOverlay", () => {
  it("renders a compact request row and selects the highlighted request", async () => {
    const { keymap, host, cleanup } = setup()
    let selected = ""
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <RequestFinderOverlay
            visible
            requests={requests}
            activeEnv={{
              name: "dev",
              vars: { API_HOST: "dev.api.example.com" },
            }}
            onSelect={(id) => {
              selected = id
            }}
            onClose={() => {}}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 100, height: 24 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("Find Request")
    expect(frame).toContain("GET")
    expect(frame).toContain("Get User")
    expect(frame).toContain("users")
    expect(frame).not.toContain("$API_HOST")
    expect(frame).not.toContain("dev.api.example.com")
    host.press("return")
    expect(selected).toBe("users/get")
    cleanup()
  })

  it("shows a clear empty state when no requests match", async () => {
    const { keymap, cleanup } = setup()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <RequestFinderOverlay
            visible
            requests={[]}
            activeEnv={null}
            onSelect={() => {}}
            onClose={() => {}}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 100, height: 24 },
    )
    await renderOnce()
    expect(captureCharFrame()).toContain("No results found")
    cleanup()
  })

  it("closes without selecting when escape is pressed", async () => {
    const { keymap, host, cleanup } = setup()
    let closed = false
    let selected = false
    const { renderOnce } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <RequestFinderOverlay
            visible
            requests={requests}
            activeEnv={null}
            onSelect={() => {
              selected = true
            }}
            onClose={() => {
              closed = true
            }}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 100, height: 24 },
    )
    await renderOnce()

    host.press("escape")

    expect(closed).toBe(true)
    expect(selected).toBe(false)
    cleanup()
  })

  it("truncates a long request name without displacing its folder", async () => {
    const { keymap, cleanup } = setup()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <RequestFinderOverlay
            visible
            requests={[
              {
                ...requests[0],
                name: "This is a request with a very very long name",
              },
            ]}
            activeEnv={null}
            onSelect={() => {}}
            onClose={() => {}}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 80, height: 20 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("This is a request with a very…")
    expect(frame).not.toContain("This is a request with a very very long name")
    expect(frame).toContain("users")
    cleanup()
  })
})
