import { describe, expect, it } from "bun:test"
import { act, useState } from "react"
import { type BoxRenderable } from "@opentui/core"
import { MouseButtons } from "@opentui/core/testing"
import { createTestKeymap } from "@opentui/keymap/testing"
import {
  registerDefaultKeys,
  registerEnabledFields,
} from "@opentui/keymap/addons"
import { KeymapProvider } from "@opentui/keymap/react"
import type { KeymapProviderProps } from "@opentui/keymap/react"
import { createTestRender } from "../testRender"
import { ThemeProvider } from "../../src/ui/theme"
import { ProxySettingsForm } from "../../src/ui/settings/ProxySettingsForm"
import type { AppProxySettings, ProxyCredentials } from "../../src/schema"

const testRender = createTestRender()

function setupKeymap() {
  const { keymap, host, cleanup: hostCleanup } = createTestKeymap()
  const disposeEnabled = registerEnabledFields(keymap)
  const disposeKeys = registerDefaultKeys(keymap)
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

describe("ProxySettingsForm", () => {
  it("moves between fields with the arrow keys", async () => {
    const { keymap, host, cleanup } = setupKeymap()
    const { renderOnce, renderer } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <ProxySettingsForm
            scope="app"
            focused
            proxy={{ mode: "custom", url: "http://proxy.test:8080" }}
            onChange={() => true}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 80, height: 18 },
    )
    await renderOnce()

    const mode = renderer.root.findDescendantById(
      "settings-proxy-mode",
    ) as BoxRenderable
    const editor = renderer.root.findDescendantById(
      "settings-proxy-editor",
    ) as BoxRenderable
    expect(mode.backgroundColor.a).toBeGreaterThan(0)
    expect(editor.backgroundColor.a).toBe(0)

    await act(async () => host.press("down"))
    expect(mode.backgroundColor.a).toBe(0)
    expect(editor.backgroundColor.a).toBeGreaterThan(0)
    cleanup()
  })

  it("switches between Fields and Advanced URL before either is filled", async () => {
    const { keymap, host, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <ProxySettingsForm
            scope="app"
            focused
            proxy={{ mode: "system" }}
            onChange={() => true}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 80, height: 18 },
    )
    await renderOnce()

    await act(async () => host.press("return"))
    await act(async () => host.press("down"))
    await act(async () => host.press("return"))
    await act(async () => host.press("tab"))
    await act(async () => host.press("return"))
    await act(async () => host.press("down"))
    await act(async () => host.press("return"))
    await renderOnce()

    expect(captureCharFrame()).toContain("Proxy URL")

    await act(async () => host.press("return"))
    await act(async () => host.press("up"))
    await act(async () => host.press("return"))
    await renderOnce()

    expect(captureCharFrame()).toContain("Hostname")
    expect(captureCharFrame()).not.toContain("Proxy URL")
    cleanup()
  })

  it("renders canonical custom proxies as structured fields", async () => {
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <ProxySettingsForm
            scope="app"
            focused
            proxy={{
              mode: "custom",
              url: "https://proxy.test:8443",
              bypass: ["localhost"],
              auth: true,
            }}
            credentials={{ username: "alice", password: "secret" }}
            onChange={() => true}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 90, height: 34 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("Fields")
    expect(frame).toContain("Hostname")
    expect(frame).toContain("Proxy authentication")
    expect(frame).toContain("Username")
    expect(frame).toContain("Password (optional)")
    expect(frame).toContain("Port (optional)")
    expect(frame).toContain("Bypass hosts (optional)")
    expect(frame).toContain("Choose the system proxy")
    expect(frame).toContain("Use structured fields")
    expect(frame).toContain("Protocol used to connect")
    expect(frame).toContain("Hostname or IP address")
    expect(frame).toContain("Optional. Uses the protocol default")
    expect(frame).toContain("Credentials are stored securely")
    expect(frame).toContain("Required when proxy authentication is enabled")
    const lines = frame.split("\n")
    expect(
      lines.findIndex((line) => line.includes("Bypass hosts (optional)")),
    ).toBeLessThan(
      lines.findIndex((line) => line.includes("Proxy authentication")),
    )
    cleanup()
  })

  it("renders structured validation errors below the invalid field", async () => {
    const { keymap, host, cleanup } = setupKeymap()
    const { renderOnce, mockInput, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <ProxySettingsForm
            scope="app"
            focused
            proxy={{ mode: "custom", url: "http://proxy.test:8080" }}
            onChange={() => true}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 90, height: 24 },
    )
    await renderOnce()

    await act(async () => host.press("down"))
    await act(async () => host.press("down"))
    await act(async () => host.press("down"))
    for (let index = 0; index < 10; index += 1) {
      await act(async () => mockInput.pressBackspace())
    }
    await renderOnce()

    const lines = captureCharFrame().split("\n")
    const hostnameLine = lines.findIndex((line) => line.includes("Hostname"))
    const errorLine = lines.findIndex((line) =>
      line.includes("Proxy hostname is required"),
    )
    const portLine = lines.findIndex((line) => line.includes("Port"))
    expect(hostnameLine).toBeGreaterThanOrEqual(0)
    expect(errorLine).toBeGreaterThan(hostnameLine)
    expect(errorLine).toBeLessThan(portLine)
    cleanup()
  })

  it("keeps non-lossless proxy URLs in Advanced mode", async () => {
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <ProxySettingsForm
            scope="collection"
            focused
            proxy={{ mode: "custom", url: "http://proxy.test/path" }}
            onChange={() => true}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 80, height: 18 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("Advanced URL")
    expect(frame).toContain("Proxy URL")
    expect(frame).not.toContain("Hostname")
    expect(frame).toContain("Proxy authentication")
    expect(frame).not.toContain("Username")
    expect(frame).not.toContain("Password (optional)")
    expect(frame).toContain("Enter only the proxy URL here")
    cleanup()
  })

  it("explains when --no-proxy overrides the saved app setting", async () => {
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <ProxySettingsForm
            scope="app"
            focused
            noProxy
            proxy={{ mode: "system" }}
            onChange={() => true}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 80, height: 12 },
    )
    await renderOnce()
    expect(captureCharFrame()).toContain(
      "disabled for this session by --no-proxy",
    )
    cleanup()
  })

  it("masks stored credentials until focused and commits them on navigation", async () => {
    const { keymap, host, cleanup } = setupKeymap()
    const commits: unknown[] = []
    const { renderOnce, captureCharFrame, mockInput } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <ProxySettingsForm
            scope="app"
            focused
            proxy={{
              mode: "custom",
              url: "https://proxy.test:8443",
              auth: true,
            }}
            credentials={{ username: "alice", password: "secret" }}
            onChange={() => true}
            onCredentialsChange={async (credentials) => {
              commits.push(credentials)
              return true
            }}
            onAuthDisable={async () => true}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 90, height: 34 },
    )
    await renderOnce()
    expect(captureCharFrame()).toContain("Username: ******")
    expect(captureCharFrame()).not.toContain("alice")
    for (let index = 0; index < 7; index++) {
      await act(async () => host.press("down"))
    }
    await renderOnce()
    expect(captureCharFrame()).toContain("Username: alice")
    await act(async () => mockInput.typeText("2"))
    expect(commits).toEqual([])
    await act(async () => host.press("down"))
    await renderOnce()
    expect(commits).toHaveLength(1)
    cleanup()
  })

  it("clears the required username error while a non-empty draft is visible", async () => {
    const { keymap, host, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame, mockInput } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <ProxySettingsForm
            scope="app"
            focused
            proxy={{
              mode: "custom",
              url: "https://proxy.test:8443",
              auth: true,
            }}
            credentials={{}}
            onChange={() => true}
            onCredentialsChange={async () => true}
            onAuthDisable={async () => true}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 90, height: 34 },
    )
    await renderOnce()
    expect(captureCharFrame()).toContain(
      "Username is required when proxy authentication is enabled",
    )
    for (let index = 0; index < 7; index++) {
      await act(async () => host.press("down"))
    }
    await act(async () => mockInput.typeText("alice"))
    await renderOnce()
    expect(captureCharFrame()).not.toContain(
      "Username is required when proxy authentication is enabled",
    )
    await act(async () => host.press("escape"))
    cleanup()
  })

  it("does not persist an empty username while authentication is enabled", async () => {
    const { keymap, host, cleanup } = setupKeymap()
    const commits: ProxyCredentials[] = []
    const { renderOnce, captureCharFrame, mockInput } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <ProxySettingsForm
            scope="app"
            focused
            proxy={{
              mode: "custom",
              url: "https://proxy.test:8443",
              auth: true,
            }}
            credentials={{ username: "alice" }}
            onChange={() => true}
            onCredentialsChange={async (credentials) => {
              commits.push(credentials)
              return true
            }}
            onAuthDisable={async () => true}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 90, height: 34 },
    )
    await renderOnce()
    for (let index = 0; index < 7; index++) {
      await act(async () => host.press("down"))
    }
    for (let index = 0; index < 5; index++) {
      await act(async () => mockInput.pressBackspace())
    }
    await act(async () => host.press("down"))
    await renderOnce()

    expect(commits).toEqual([])
    expect(captureCharFrame()).toContain("Could not save secret")
    cleanup()
  })

  it("disables proxy authentication with Space", async () => {
    const { keymap, host, cleanup } = setupKeymap()

    function Harness() {
      const [proxy, setProxy] = useState<AppProxySettings>({
        mode: "custom",
        url: "https://proxy.test:8443",
        auth: true,
      })
      return (
        <ProxySettingsForm
          scope="app"
          focused
          proxy={proxy}
          credentials={{ username: "alice" }}
          onChange={(next) => {
            setProxy(next as AppProxySettings)
            return true
          }}
          onCredentialsChange={async () => true}
          onAuthDisable={async () => {
            setProxy({ mode: "custom", url: "https://proxy.test:8443" })
            return true
          }}
        />
      )
    }

    const { renderOnce, captureCharFrame, renderer, mockMouse } =
      await testRender(
        <KeymapProvider keymap={keymap}>
          <ThemeProvider activeIndex={0} previewIndex={null}>
            <Harness />
          </ThemeProvider>
        </KeymapProvider>,
        { width: 90, height: 30 },
      )
    await renderOnce()
    for (let index = 0; index < 6; index++) {
      await act(async () => host.press("down"))
    }
    await act(async () => host.press("space"))
    await renderOnce()
    expect(captureCharFrame()).toContain("Proxy authentication (optional): [ ]")
    expect(captureCharFrame()).not.toContain("Username:")
    const authRow = renderer.root.findDescendantById(
      "settings-proxy-auth",
    ) as BoxRenderable
    await act(async () => {
      await mockMouse.pressDown(
        authRow.screenX + 1,
        authRow.screenY,
        MouseButtons.LEFT,
      )
    })
    await renderOnce()
    expect(captureCharFrame()).toContain("Proxy authentication (optional): [x]")
    cleanup()
  })

  it("disables proxy authentication with Return", async () => {
    const { keymap, host, cleanup } = setupKeymap()

    function Harness() {
      const [proxy, setProxy] = useState<AppProxySettings>({
        mode: "custom",
        url: "https://proxy.test:8443",
        auth: true,
      })
      return (
        <ProxySettingsForm
          scope="app"
          focused
          proxy={proxy}
          credentials={{ username: "alice" }}
          onChange={(next) => {
            setProxy(next as AppProxySettings)
            return true
          }}
          onCredentialsChange={async () => true}
          onAuthDisable={async () => {
            setProxy({ mode: "custom", url: "https://proxy.test:8443" })
            return true
          }}
        />
      )
    }

    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <Harness />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 90, height: 30 },
    )
    await renderOnce()
    for (let index = 0; index < 6; index++) {
      await act(async () => host.press("down"))
    }
    await act(async () => host.press("return"))
    await renderOnce()
    expect(captureCharFrame()).toContain("Proxy authentication (optional): [ ]")
    cleanup()
  })

  it("disables local authentication when the invalid proxy was never persisted", async () => {
    const { keymap, host, cleanup } = setupKeymap()
    let disableCalls = 0
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <ProxySettingsForm
            scope="app"
            focused
            proxy={{ mode: "system" }}
            onChange={() => true}
            onAuthDisable={async () => {
              disableCalls++
              return false
            }}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 90, height: 30 },
    )
    await renderOnce()
    await act(async () => host.press("return"))
    await act(async () => host.press("down"))
    await act(async () => host.press("return"))
    for (let index = 0; index < 6; index++) {
      await act(async () => host.press("down"))
    }
    await act(async () => host.press("space"))
    await renderOnce()
    expect(captureCharFrame()).toContain("Proxy authentication (optional): [x]")
    await act(async () => host.press("space"))
    await renderOnce()
    expect(captureCharFrame()).toContain("Proxy authentication (optional): [ ]")
    expect(disableCalls).toBe(0)
    cleanup()
  })

  it("merges a password commit behind a pending username save", async () => {
    const { keymap, host, cleanup } = setupKeymap()
    let finishFirstSave = () => {}
    const firstSave = new Promise<void>((resolve) => {
      finishFirstSave = resolve
    })
    let markSecondSaveStarted = () => {}
    const secondSaveStarted = new Promise<void>((resolve) => {
      markSecondSaveStarted = resolve
    })
    const commits: ProxyCredentials[] = []

    function Harness() {
      const [credentials, setCredentials] = useState<ProxyCredentials>({
        username: "alice",
        password: "secret",
      })
      return (
        <ProxySettingsForm
          scope="app"
          focused
          proxy={{
            mode: "custom",
            url: "https://proxy.test:8443",
            auth: true,
          }}
          credentials={credentials}
          onChange={() => true}
          onCredentialsChange={async (next) => {
            commits.push(next)
            if (commits.length === 1) await firstSave
            else markSecondSaveStarted()
            setCredentials(next)
            return true
          }}
          onAuthDisable={async () => true}
        />
      )
    }

    const { renderOnce, mockInput } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <Harness />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 90, height: 34 },
    )
    await renderOnce()
    for (let index = 0; index < 7; index++) {
      await act(async () => host.press("down"))
    }
    await act(async () => mockInput.typeText("2"))
    await act(async () => host.press("down"))
    await act(async () => mockInput.typeText("2"))
    await act(async () => host.press("up"))

    expect(commits).toEqual([{ username: "alice2", password: "secret" }])
    await act(async () => {
      finishFirstSave()
      await secondSaveStarted
    })
    expect(commits).toEqual([
      { username: "alice2", password: "secret" },
      { username: "alice2", password: "secret2" },
    ])
    cleanup()
  })

  it("merges a username commit behind a pending password save", async () => {
    const { keymap, host, cleanup } = setupKeymap()
    let finishFirstSave = () => {}
    const firstSave = new Promise<void>((resolve) => {
      finishFirstSave = resolve
    })
    let markSecondSaveStarted = () => {}
    const secondSaveStarted = new Promise<void>((resolve) => {
      markSecondSaveStarted = resolve
    })
    const commits: ProxyCredentials[] = []

    function Harness() {
      const [credentials, setCredentials] = useState<ProxyCredentials>({
        username: "alice",
        password: "secret",
      })
      return (
        <ProxySettingsForm
          scope="app"
          focused
          proxy={{
            mode: "custom",
            url: "https://proxy.test:8443",
            auth: true,
          }}
          credentials={credentials}
          onChange={() => true}
          onCredentialsChange={async (next) => {
            commits.push(next)
            if (commits.length === 1) await firstSave
            else markSecondSaveStarted()
            setCredentials(next)
            return true
          }}
          onAuthDisable={async () => true}
        />
      )
    }

    const { renderOnce, mockInput } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <Harness />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 90, height: 34 },
    )
    await renderOnce()
    for (let index = 0; index < 8; index++) {
      await act(async () => host.press("down"))
    }
    await act(async () => mockInput.typeText("2"))
    await act(async () => host.press("up"))
    await act(async () => mockInput.typeText("2"))
    await act(async () => host.press("down"))

    expect(commits).toEqual([{ username: "alice", password: "secret2" }])
    await act(async () => {
      finishFirstSave()
      await secondSaveStarted
    })
    expect(commits).toEqual([
      { username: "alice", password: "secret2" },
      { username: "alice2", password: "secret2" },
    ])
    cleanup()
  })

  it("keeps authentication disabled when a username commit is still pending", async () => {
    const { keymap, host, cleanup } = setupKeymap()
    let finishCredentialSave = () => {}
    const credentialSave = new Promise<void>((resolve) => {
      finishCredentialSave = resolve
    })

    function Harness() {
      const [proxy, setProxy] = useState<AppProxySettings>({
        mode: "custom",
        url: "https://proxy.test:8443",
        auth: true,
      })
      return (
        <ProxySettingsForm
          scope="app"
          focused
          proxy={proxy}
          credentials={{}}
          onChange={(next) => {
            setProxy(next as AppProxySettings)
            return true
          }}
          onCredentialsChange={async () => {
            await credentialSave
            setProxy({
              mode: "custom",
              url: "https://proxy.test:8443",
              auth: true,
            })
            return true
          }}
          onAuthDisable={async () => {
            setProxy({ mode: "custom", url: "https://proxy.test:8443" })
            return true
          }}
        />
      )
    }

    const { renderOnce, captureCharFrame, mockInput } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <Harness />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 90, height: 30 },
    )
    await renderOnce()
    for (let index = 0; index < 7; index++) {
      await act(async () => host.press("down"))
    }
    await act(async () => mockInput.typeText("alice"))
    await act(async () => host.press("up"))
    await act(async () => host.press("space"))
    await renderOnce()
    expect(captureCharFrame()).toContain("Proxy authentication (optional): [ ]")
    await act(async () => finishCredentialSave())
    await renderOnce()
    expect(captureCharFrame()).toContain("Proxy authentication (optional): [ ]")
    cleanup()
  })
})
