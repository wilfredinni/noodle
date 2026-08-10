import { describe, expect, it } from "bun:test"
import { createTestKeymap } from "@opentui/keymap/testing"
import {
  registerDefaultKeys,
  registerEnabledFields,
} from "@opentui/keymap/addons"
import { KeymapProvider } from "@opentui/keymap/react"
import type { KeymapProviderProps } from "@opentui/keymap/react"
import { act } from "react"
import { createTestRender } from "../testRender"
import { ThemeProvider } from "../../src/ui/theme"
import { TlsSettingsForm } from "../../src/ui/settings/TlsSettingsForm"

const testRender = createTestRender()

function setupKeymap() {
  const { keymap, host, cleanup: hostCleanup } = createTestKeymap()
  const disposeEnabled = registerEnabledFields(keymap)
  const disposeKeys = registerDefaultKeys(keymap)
  keymap.setData("app.overlay", "none")
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

describe("TlsSettingsForm", () => {
  it("renders collection trust and mTLS settings", async () => {
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <TlsSettingsForm
            focused
            insecure={false}
            collectionDir="/tmp/collection"
            activeEnv={{ name: "dev", vars: { PASS: "secret" } }}
            settings={{
              verify: true,
              caBundle: "./certs/ca.pem",
              clientCertificates: [
                {
                  host: "api.example.com",
                  port: 8443,
                  certFile: "./certs/client.pem",
                  keyFile: "./certs/key.pem",
                  passphrase: "$PASS",
                },
              ],
            }}
            onChange={() => true}
            onExit={() => {}}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 90, height: 40 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("Verify TLS certificates")
    expect(frame).toContain("CA bundle")
    expect(frame).toContain("api.example.com")
    expect(frame).toContain("Certificate chain")
    expect(frame).toContain("Private key")
    cleanup()
  })

  it("defaults verification on and toggles it with one checkbox", async () => {
    const { keymap, host, cleanup } = setupKeymap()
    const changes: unknown[] = []
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <TlsSettingsForm
            focused
            insecure={false}
            collectionDir="/tmp/collection"
            activeEnv={null}
            onChange={(settings) => {
              changes.push(settings)
              return true
            }}
            onExit={() => {}}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 80, height: 16 },
    )
    await renderOnce()
    expect(captureCharFrame()).toContain("[x] Verify TLS certificates")
    await act(async () => host.press("space"))
    expect(changes).toEqual([{ verify: false }])
    cleanup()
  })

  it("explains when --insecure overrides saved verification", async () => {
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <TlsSettingsForm
            focused
            insecure
            collectionDir="/tmp/collection"
            activeEnv={null}
            settings={{ verify: true }}
            onChange={() => true}
            onExit={() => {}}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 80, height: 16 },
    )
    await renderOnce()
    expect(captureCharFrame()).toContain(
      "disabled for this session by --insecure",
    )
    cleanup()
  })
})
