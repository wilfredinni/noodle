import { describe, expect, it } from "bun:test"
import { RGBA, type BoxRenderable } from "@opentui/core"
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
import { auraTheme } from "../../src/ui/theme-data"
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
  it("moves between fields with the arrow keys", async () => {
    const { keymap, host, cleanup } = setupKeymap()
    const { renderOnce, renderer } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <TlsSettingsForm
            focused
            insecure={false}
            collectionDir="/tmp/collection"
            activeEnv={null}
            settings={{ verify: true }}
            onChange={() => true}
            onExit={() => {}}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 80, height: 18 },
    )
    await renderOnce()

    const verify = renderer.root.findDescendantById(
      "settings-tls-verify",
    ) as BoxRenderable
    const caBundle = renderer.root.findDescendantById(
      "settings-tls-ca-bundle",
    ) as BoxRenderable
    expect(verify.backgroundColor.a).toBeGreaterThan(0)
    expect(caBundle.backgroundColor.a).toBe(0)

    await act(async () => host.press("down"))
    expect(verify.backgroundColor.a).toBe(0)
    expect(caBundle.backgroundColor.a).toBeGreaterThan(0)
    cleanup()
  })

  it("renders collection trust and mTLS settings", async () => {
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame, captureSpans, renderer } =
      await testRender(
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
    expect(frame).toContain("Exact host and port match")
    expect(frame).toContain("Bare hostname matched exactly")
    expect(frame).toContain("Private key paired with the certificate chain")
    expect(frame).toContain("enabled")
    expect(frame).not.toContain("Use a bare host and complete fields to enable")
    const rows = frame.split("\n")
    const clientCertificatesRow = rows.findIndex((row) =>
      row.includes("Client certificates"),
    )
    expect(rows[clientCertificatesRow + 1]).toContain(
      "A list of certificate and private-key pairs",
    )
    expect(frame.match(/\+ Add client certificate/g)).toHaveLength(2)
    expect(
      renderer.root.findDescendantById("settings-tls-add-top"),
    ).toBeDefined()
    expect(
      renderer.root.findDescendantById("settings-tls-add-bottom"),
    ).toBeDefined()
    const addSpans = captureSpans()
      .lines.flatMap((line) => line.spans)
      .filter((span) => span.text.includes("+ Add client certificate"))
    expect(addSpans).toHaveLength(2)
    expect(
      addSpans.every((span) => span.fg.equals(RGBA.fromHex(auraTheme.primary))),
    ).toBe(true)
    const profile = renderer.root.findDescendantById(
      "settings-tls-profile-0",
    ) as BoxRenderable
    const addTop = renderer.root.findDescendantById(
      "settings-tls-add-top",
    ) as BoxRenderable
    expect(profile.screenX).toBe(addTop.screenX + 2)
    expect(profile.backgroundColor.a).toBe(0)
    const hostRow = rows.findIndex((row) => row.includes("Host:"))
    expect(rows[hostRow]).toContain("api.example.com")
    cleanup()
  })

  it("starts with no client certificate profiles by default", async () => {
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <TlsSettingsForm
            focused
            insecure={false}
            collectionDir="/tmp/collection"
            activeEnv={null}
            settings={{ verify: true, clientCertificates: [] }}
            onChange={() => true}
            onExit={() => {}}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 90, height: 18 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame.match(/\+ Add client certificate/g)).toHaveLength(1)
    expect(frame).toContain("Client certificates (0)")
    expect(frame).not.toContain("Certificate 1")
    expect(frame).not.toContain("Host:")
    cleanup()
  })

  it("highlights remove certificate on hover", async () => {
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, renderer, mockMouse, captureSpans } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <TlsSettingsForm
            focused
            insecure={false}
            collectionDir="/tmp/collection"
            activeEnv={null}
            settings={{
              clientCertificates: [
                {
                  host: "api.example.com",
                  certFile: "client.pem",
                  keyFile: "client-key.pem",
                },
              ],
            }}
            onChange={() => true}
            onExit={() => {}}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 90, height: 24 },
    )
    await renderOnce()
    const remove = renderer.root.findDescendantById(
      "settings-tls-remove-0",
    ) as BoxRenderable
    expect(remove.backgroundColor.a).toBe(0)
    const removeSpan = captureSpans()
      .lines.flatMap((line) => line.spans)
      .find((span) => span.text.includes("Remove certificate"))
    expect(removeSpan?.fg.equals(RGBA.fromHex(auraTheme.error))).toBe(true)
    await act(async () => {
      await mockMouse.moveTo(remove.screenX + 1, remove.screenY)
    })
    expect(remove.backgroundColor.a).toBeGreaterThan(0)
    const hoveredRemoveSpan = captureSpans()
      .lines.flatMap((line) => line.spans)
      .find((span) => span.text.includes("Remove certificate"))
    expect(hoveredRemoveSpan?.fg.equals(RGBA.fromHex(auraTheme.error))).toBe(
      true,
    )
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
