import { describe, expect, it } from "bun:test"
import { act, useState } from "react"
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
import {
  SettingsView,
  type SettingsCategory,
  type SettingsScope,
} from "../../src/ui/settings/SettingsView"

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
  initialFocus = "settings-sidebar",
  onCategoryVisited = () => {},
}: {
  collectionAvailable?: boolean
  onClose?: () => void
  initialCategory?: SettingsCategory
  initialFocus?: Focus
  onCategoryVisited?: (category: SettingsCategory) => void
}) {
  const [scope, setScope] = useState<SettingsScope>("global")
  const [category, setCategory] = useState<SettingsCategory>(initialCategory)
  const [focus, setFocus] = useState<Focus>(initialFocus)
  return (
    <SettingsView
      scope={scope}
      category={category}
      collectionAvailable={collectionAvailable}
      focus={focus}
      activeThemeIndex={0}
      layout="stacked"
      confirmUndoAll
      appProxy={{ mode: "system" }}
      collectionProxy={{ mode: "inherit" }}
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
      onThemeChange={() => {}}
      onLayoutChange={() => true}
      onConfirmUndoAllChange={() => {}}
      onAppProxyChange={() => true}
      onCollectionProxyChange={() => true}
      onEnvironmentChange={() => {}}
      onKeybindChange={() => true}
      onCollectionsChange={() => true}
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
      expect(frame).toContain("Theme")
      expect(frame).toContain("Choose how Noodle looks")
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
      { width: 90, height: 22 },
    )
    await renderOnce()
    await act(async () => host.press("right"))
    expect(captureCharFrame()).toContain("Active environment")
    expect(captureCharFrame()).toContain("Choose the environment used")
    cleanup()
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
})
