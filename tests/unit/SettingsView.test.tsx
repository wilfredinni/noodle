import { describe, expect, it } from "bun:test"
import { act, useState } from "react"
import { type BoxRenderable, type InputRenderable } from "@opentui/core"
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
import { bindingDefaults } from "../../src/ui/keybind"
import type { Focus } from "../../src/ui/focus"
import type { AppProxySettings, CollectionSettings } from "../../src/schema"
import {
  SettingsView,
  parseTimelineMaxEntries,
  type SettingsCategory,
  type SettingsScope,
} from "../../src/ui/settings/SettingsView"
import { SIDEBAR_WIDTH } from "../../src/ui/Sidebar"

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

function Harness({
  collectionAvailable = true,
  onClose = () => {},
  initialCategory = "appearance",
  initialScope = "global",
  initialFocus = "settings-sidebar",
  onCategoryVisited = () => {},
  onCollectionsChange = () => true,
  onCollectionUnregister = () => {},
  onKeybindChange = () => true,
  onCollectionSettingsChange = () => true,
  onThemeChange = () => {},
  appProxy = { mode: "system" },
  initialCollectionSettings = {},
}: {
  collectionAvailable?: boolean
  onClose?: () => void
  initialCategory?: SettingsCategory
  initialScope?: SettingsScope
  initialFocus?: Focus
  onCategoryVisited?: (category: SettingsCategory) => void
  onCollectionsChange?: (collections: string[]) => boolean
  onCollectionUnregister?: (path: string) => void
  onKeybindChange?: (name: string, key: string) => boolean
  onCollectionSettingsChange?: (
    patch: Pick<
      CollectionSettings,
      "name" | "description" | "timelineMaxEntries"
    >,
  ) => boolean
  onThemeChange?: (index: number) => void
  appProxy?: AppProxySettings
  initialCollectionSettings?: CollectionSettings
}) {
  const [scope, setScope] = useState<SettingsScope>(initialScope)
  const [category, setCategory] = useState<SettingsCategory>(initialCategory)
  const [focus, setFocus] = useState<Focus>(initialFocus)
  const [collectionSettings, setCollectionSettings] = useState(
    initialCollectionSettings,
  )
  return (
    <SettingsView
      scope={scope}
      category={category}
      collectionAvailable={collectionAvailable}
      focus={focus}
      activeThemeIndex={0}
      layout="stacked"
      confirmUndoAll
      appProxy={appProxy}
      collectionProxy={{ mode: "inherit" }}
      collectionName={collectionSettings.name}
      collectionDescription={collectionSettings.description}
      timelineMaxEntries={collectionSettings.timelineMaxEntries}
      noProxy={false}
      activeEnv={{ name: "development", vars: {} }}
      envNames={["development", "production"]}
      activeEnvName="development"
      keybinds={bindingDefaults()}
      collections={["/tmp/one", "/tmp/two"]}
      activeCollectionDir="/tmp/one"
      onScopeChange={(next) => {
        setScope(next)
        setCategory(next === "global" ? "appearance" : "general")
      }}
      onCategoryChange={(next) => {
        onCategoryVisited(next)
        setCategory(next)
      }}
      onPaneFocus={setFocus}
      onClose={onClose}
      onThemeChange={onThemeChange}
      onLayoutChange={() => true}
      onConfirmUndoAllChange={() => {}}
      onAppProxyChange={() => true}
      onCollectionProxyChange={() => true}
      onCollectionSettingsChange={(patch) => {
        if (!onCollectionSettingsChange(patch)) return false
        setCollectionSettings((current) => ({ ...current, ...patch }))
        return true
      }}
      onEnvironmentChange={() => {}}
      onKeybindChange={onKeybindChange}
      onCollectionsChange={onCollectionsChange}
      onCollectionUnregister={onCollectionUnregister}
      onRegisterCollection={() => null}
    />
  )
}

describe("SettingsView", () => {
  it("renders the global scope and categories at wide and compact sizes", async () => {
    for (const size of [
      { width: 110, height: 30 },
      { width: 64, height: 16 },
    ]) {
      const { keymap, cleanup } = setupKeymap()
      const { renderOnce, captureCharFrame } = await testRender(
        <KeymapProvider keymap={keymap}>
          <ThemeProvider activeIndex={0} previewIndex={null}>
            <Harness />
          </ThemeProvider>
        </KeymapProvider>,
        size,
      )
      await renderOnce()
      const frame = captureCharFrame()
      expect(frame).toContain("Global")
      expect(frame).toContain("Collection")
      expect(frame).toContain("Appearance")
      expect(frame).toContain("Keyboard")
      expect(frame).toContain("Proxy")
      expect(frame).not.toContain("Network")
      expect(frame).toContain("Theme")
      expect(frame).not.toContain("Settings")
      expect(frame).not.toContain("Auto-save")
      expect(frame).toContain("Choose how Noodle")
      if (size.width === 110) {
        const lines = frame.split("\n")
        const sectionDescriptionLine = lines.findIndex((line) =>
          line.includes("Choose how Noodle looks"),
        )
        expect(sectionDescriptionLine).toBe(2)
        const themeLine = lines.findIndex((line) => line.includes("Theme"))
        const selectLine = lines.findIndex(
          (line, index) => index > themeLine && line.includes("aura"),
        )
        const descriptionLine = lines.findIndex((line) =>
          line.includes("Color palette used throughout Noodle."),
        )
        expect(themeLine).toBeLessThan(selectLine)
        expect(selectLine).toBeLessThan(descriptionLine)
      }
      cleanup()
    }
  })

  it("uses the shared sidebar width and keeps core controls visible", async () => {
    for (const size of [
      { width: 64, height: 16 },
      { width: 80, height: 24 },
      { width: 110, height: 30 },
    ]) {
      const { keymap, cleanup } = setupKeymap()
      const { renderOnce, captureCharFrame, renderer } = await testRender(
        <KeymapProvider keymap={keymap}>
          <ThemeProvider activeIndex={0} previewIndex={null}>
            <Harness />
          </ThemeProvider>
        </KeymapProvider>,
        size,
      )
      await renderOnce()

      const scope = renderer.root.findDescendantById("settings-scope-global")!
      const section = renderer.root.findDescendantById(
        "settings-section-header",
      )!
      expect(section.screenX - scope.screenX).toBe(SIDEBAR_WIDTH + 1)
      expect(captureCharFrame()).toContain("Theme")
      cleanup()
    }
  })

  it("uses the shared theme select behavior", async () => {
    const { keymap, host, cleanup } = setupKeymap()
    const selected: number[] = []
    const { renderOnce } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <Harness
            initialFocus="settings-content"
            onThemeChange={(index) => selected.push(index)}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 80, height: 24 },
    )
    await renderOnce()
    await act(async () => host.press("return"))
    await act(async () => host.press("down"))
    await act(async () => host.press("return"))
    expect(selected).toEqual([1])
    cleanup()
  })

  it("keeps Collection disabled in browse/empty modes", async () => {
    const { keymap, host, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <Harness collectionAvailable={false} />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 90, height: 20 },
    )
    await renderOnce()
    expect(captureCharFrame()).toContain("Initialize this directory")
    await act(async () => host.press("right"))
    expect(captureCharFrame()).toContain("Appearance")
    expect(captureCharFrame()).not.toContain("Active environment")
    cleanup()
  })

  it("activates category navigation", async () => {
    const { keymap, host, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <Harness />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 90, height: 22 },
    )
    await renderOnce()
    await act(async () => host.press("down"))
    expect(captureCharFrame()).toContain("Confirm undo all")
    cleanup()
  })

  it("switches to collection scope", async () => {
    const { keymap, host, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <Harness />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 90, height: 32 },
    )
    await renderOnce()
    await act(async () => host.press("right"))
    expect(captureCharFrame()).toContain("Active environment")
    expect(captureCharFrame()).toContain("Describe this collection")
    expect(captureCharFrame()).toContain("history.")
    cleanup()
  })

  it("commits collection name and multiline description when tabbing", async () => {
    const { keymap, host, cleanup } = setupKeymap()
    const patches: Array<Partial<CollectionSettings>> = []
    const { renderOnce, mockInput, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <Harness
            initialScope="collection"
            initialCategory="general"
            initialFocus="settings-content"
            onCollectionSettingsChange={(patch) => {
              patches.push(patch)
              return true
            }}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 90, height: 26 },
    )
    await renderOnce()

    await act(async () => mockInput.typeText("Payments API"))
    await act(async () => host.press("tab"))
    await act(async () => mockInput.typeText("First line"))
    await act(async () => host.press("return"))
    await act(async () => mockInput.typeText("Second line"))
    await act(async () => host.press("tab"))
    await renderOnce()

    expect(patches).toEqual([
      { name: "Payments API" },
      { description: "First line\nSecond line" },
    ])
    expect(captureCharFrame()).toContain("Timeline entries")
    cleanup()
  })

  it("keeps invalid timeline retention unsaved with an inline error", async () => {
    const { keymap, host, cleanup } = setupKeymap()
    const patches: Array<Partial<CollectionSettings>> = []
    const { renderOnce, mockInput, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <Harness
            initialScope="collection"
            initialCategory="general"
            initialFocus="settings-content"
            onCollectionSettingsChange={(patch) => {
              patches.push(patch)
              return true
            }}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 90, height: 26 },
    )
    await renderOnce()
    await act(async () => host.press("tab"))
    await act(async () => host.press("tab"))
    await act(async () => host.press("backspace"))
    await act(async () => host.press("backspace"))
    await act(async () => mockInput.typeText("-1"))
    await act(async () => host.press("tab"))
    await renderOnce()

    expect(patches).toEqual([])
    expect(captureCharFrame()).toContain("non-negative")
    expect(captureCharFrame()).toContain("blank for 50")
    cleanup()
  })

  it("parses blank timeline retention as the default and accepts zero", () => {
    expect(parseTimelineMaxEntries("  ")).toEqual({ value: undefined })
    expect(parseTimelineMaxEntries("0")).toEqual({ value: 0 })
    expect(parseTimelineMaxEntries("-1")).toHaveProperty("error")
  })

  it("keeps registered collection rows compact", async () => {
    const { keymap, host, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame, renderer } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <Harness
            initialCategory="collections"
            initialFocus="settings-content"
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 90, height: 24 },
    )
    await renderOnce()
    await act(async () => host.press("down"))
    const frame = captureCharFrame()
    expect(frame).not.toContain("Ctrl+↑/↓ move")
    const lines = frame.split("\n")
    const collectionsTitleLine = lines.findIndex((line) =>
      line.includes("Registered collections"),
    )
    const firstPathLine = lines.findIndex((line) => line.includes("/tmp/one"))
    const secondPathLine = lines.findIndex((line) => line.includes("/tmp/two"))
    const registerLine = lines.findIndex((line) =>
      line.includes("Register collection"),
    )
    const inputLine = lines.findIndex((line) =>
      line.includes("@/Projects/my-api"),
    )
    const descriptionLine = lines.findIndex((line) =>
      line.includes("Add an initialized collection."),
    )
    expect(collectionsTitleLine).toBeLessThan(firstPathLine)
    expect(firstPathLine).toBeLessThan(secondPathLine)
    expect(secondPathLine).toBeLessThan(registerLine)
    expect(registerLine).toBeLessThan(inputLine)
    expect(inputLine).toBeLessThan(descriptionLine)
    const first = renderer.root.findDescendantById("settings-collection-0")!
    const second = renderer.root.findDescendantById("settings-collection-1")!
    expect(second.screenY - first.screenY).toBe(1)
    cleanup()
  })

  it("only shows a selected collection while the content pane is active", async () => {
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureSpans, mockMouse, renderer } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <Harness initialCategory="collections" />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 90, height: 24 },
    )
    await renderOnce()
    let spans = captureSpans().lines.flatMap((line) => line.spans)
    let first = spans.find((span) => span.text.includes("/tmp/one"))!
    let second = spans.find((span) => span.text.includes("/tmp/two"))!
    expect(first.fg.equals(second.fg)).toBe(true)

    const row = renderer.root.findDescendantById("settings-collection-0")!
    await act(async () => {
      await mockMouse.click(row.screenX + 2, row.screenY, MouseButtons.LEFT)
    })
    await renderOnce()
    spans = captureSpans().lines.flatMap((line) => line.spans)
    first = spans.find((span) => span.text.includes("/tmp/one"))!
    second = spans.find((span) => span.text.includes("/tmp/two"))!
    expect(first.fg.equals(second.fg)).toBe(false)
    cleanup()
  })

  it("requests confirmation before unregistering a collection", async () => {
    const { keymap, host, cleanup } = setupKeymap()
    const requested: string[] = []
    let changes = 0
    const { renderOnce } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <Harness
            initialCategory="collections"
            initialFocus="settings-content"
            onCollectionsChange={() => {
              changes++
              return true
            }}
            onCollectionUnregister={(path) => requested.push(path)}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 90, height: 24 },
    )
    await renderOnce()
    await act(async () => host.press("delete"))
    expect(requested).toEqual(["/tmp/one"])
    expect(changes).toBe(0)
    cleanup()
  })

  it("focuses the register collection input with the mouse", async () => {
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, mockMouse, renderer } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <Harness
            initialCategory="collections"
            initialFocus="settings-content"
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 90, height: 24 },
    )
    await renderOnce()
    const register = renderer.root.findDescendantById(
      "settings-collection-register",
    )!
    await act(async () => {
      await mockMouse.click(
        register.screenX + 2,
        register.screenY + 1,
        MouseButtons.LEFT,
      )
    })
    await renderOnce()
    const input = register.getChildren()[1]?.getChildren()[0] as
      InputRenderable | undefined
    expect(input?.focused).toBe(true)
    cleanup()
  })

  it("activates a category with the mouse", async () => {
    const { keymap, cleanup } = setupKeymap()
    const selected: { current: SettingsCategory | "" } = { current: "" }
    const { renderOnce, mockMouse, renderer } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <Harness
            onCategoryVisited={(category) => (selected.current = category)}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 90, height: 22 },
    )
    await renderOnce()
    const behavior = renderer.root.findDescendantById(
      "settings-category-behavior",
    )!
    await act(async () => {
      await mockMouse.click(
        behavior.screenX + 3,
        behavior.screenY,
        MouseButtons.LEFT,
      )
    })
    expect(selected.current).toBe("behavior")
    cleanup()
  })

  it("closes with Escape", async () => {
    const { keymap, host, cleanup } = setupKeymap()
    let closed = false
    const { renderOnce } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <Harness onClose={() => (closed = true)} />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 80, height: 18 },
    )
    await renderOnce()
    await act(async () => host.press("escape"))
    expect(closed).toBe(true)
    cleanup()
  })

  it("shows grouped configurable keyboard bindings", async () => {
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame, renderer } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <Harness initialCategory="keyboard" />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 110, height: 120 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("Navigation")
    expect(frame).toContain("Request")
    expect(frame).toContain("System")
    expect(frame).not.toContain("fixed")
    expect(frame).toContain("Open settings")
    expect(frame).not.toContain("Enter rebinds")
    const find = renderer.root.findDescendantById("settings-key-request_find")!
    const create = renderer.root.findDescendantById("settings-key-request_new")!
    const environment = renderer.root.findDescendantById(
      "settings-key-env_cycle",
    )!
    expect(create.screenY - find.screenY).toBe(1)
    expect(environment.screenY - create.screenY).toBeGreaterThan(1)
    cleanup()
  })

  it("only highlights a keyboard row while the content pane is active", async () => {
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, renderer } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <Harness initialCategory="keyboard" />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 90, height: 24 },
    )
    await renderOnce()

    const firstRow = () =>
      renderer.root.findDescendantById(
        "settings-key-jump_mode-row",
      ) as BoxRenderable
    expect(firstRow().backgroundColor.a).toBe(0)
    cleanup()

    const activeKeymap = setupKeymap()
    const activeRender = await testRender(
      <KeymapProvider keymap={activeKeymap.keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <Harness initialCategory="keyboard" initialFocus="settings-content" />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 90, height: 24 },
    )
    await activeRender.renderOnce()
    expect(
      (
        activeRender.renderer.root.findDescendantById(
          "settings-key-jump_mode-row",
        ) as BoxRenderable
      ).backgroundColor.a,
    ).toBeGreaterThan(0)
    activeKeymap.cleanup()
  })

  it("keeps the focused proxy field visible in a compact terminal", async () => {
    const { keymap, host, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <Harness
            initialCategory="network"
            initialFocus="settings-content"
            appProxy={{
              mode: "custom",
              url: "http://$PROXY_USER:$PROXY_PASSWORD@proxy.test:8080",
            }}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 72, height: 12 },
    )
    await renderOnce()

    for (let index = 0; index < 8; index++) {
      await act(async () => host.press("tab"))
      await renderOnce()
    }

    expect(captureCharFrame()).toContain("Password variable")
    expect(keymap.getData("app.text-input")).toBe(true)
    cleanup()
  })

  it("shows shortcut capture errors beside the selected binding", async () => {
    const { keymap, host, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <Harness initialCategory="keyboard" initialFocus="settings-content" />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 72, height: 12 },
    )
    await renderOnce()

    await act(async () => host.press("return"))
    await act(async () => host.press("f5"))
    await renderOnce()

    expect(captureCharFrame()).toContain("That key cannot be assigned")
    cleanup()
  })

  it("resets shortcuts only for an unmodified r", async () => {
    const { keymap, host, cleanup } = setupKeymap()
    let changes = 0
    const { renderOnce } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <Harness
            initialCategory="keyboard"
            initialFocus="settings-content"
            onKeybindChange={() => {
              changes++
              return true
            }}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 72, height: 12 },
    )
    await renderOnce()

    await act(async () => host.press("ctrl+r"))
    expect(changes).toBe(0)
    await act(async () => host.press("r"))
    expect(changes).toBe(1)
    cleanup()
  })
})
