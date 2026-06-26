import { describe, it, expect } from "bun:test"
import { createTestKeymap } from "@opentui/keymap/testing"
import {
  registerEnabledFields,
  registerDefaultKeys,
} from "@opentui/keymap/addons"

function setup() {
  const { keymap, host, cleanup: hostCleanup } = createTestKeymap()
  const disposeEnabled = registerEnabledFields(keymap)
  const disposeKeys = registerDefaultKeys(keymap)
  keymap.setData("app.mode", "base")
  keymap.setData("app.focus", "sidebar")
  keymap.setData("app.overlay", "none")
  return {
    keymap,
    host,
    cleanup: () => {
      disposeEnabled()
      disposeKeys()
      hostCleanup()
    },
  }
}

describe("keymap dispatch", () => {
  it("dispatches request.send when s is pressed", () => {
    const { keymap, host, cleanup } = setup()
    let called = false

    keymap.registerLayer({
      enabled: () =>
        keymap.getData("app.mode") === "base" &&
        keymap.getData("app.overlay") === "none",
      commands: [
        {
          name: "request.send",
          run: () => {
            called = true
          },
        },
      ],
      bindings: [{ key: "s", cmd: "request.send" }],
    })

    host.press("s")
    expect(called).toBe(true)
    cleanup()
  })

  it("does not dispatch when layer disabled by mode", () => {
    const { keymap, host, cleanup } = setup()
    keymap.setData("app.mode", "browse")
    let called = false

    keymap.registerLayer({
      enabled: () => keymap.getData("app.mode") === "base",
      commands: [
        {
          name: "request.send",
          run: () => {
            called = true
          },
        },
      ],
      bindings: [{ key: "s", cmd: "request.send" }],
    })

    host.press("s")
    expect(called).toBe(false)
    cleanup()
  })

  it("does not dispatch when command disabled by focus", () => {
    const { keymap, host, cleanup } = setup()
    keymap.setData("app.focus", "urlbar")
    let called = false

    keymap.registerLayer({
      enabled: () => true,
      commands: [
        {
          name: "request.send",
          enabled: () => keymap.getData("app.focus") !== "urlbar",
          run: () => {
            called = true
          },
        },
      ],
      bindings: [{ key: "s", cmd: "request.send" }],
    })

    host.press("s")
    expect(called).toBe(false)
    cleanup()
  })

  it("does not dispatch when overlay is active", () => {
    const { keymap, host, cleanup } = setup()
    keymap.setData("app.overlay", "help")
    let called = false

    keymap.registerLayer({
      enabled: () =>
        keymap.getData("app.mode") === "base" &&
        keymap.getData("app.overlay") === "none",
      commands: [
        {
          name: "request.send",
          run: () => {
            called = true
          },
        },
      ],
      bindings: [{ key: "s", cmd: "request.send" }],
    })

    host.press("s")
    expect(called).toBe(false)
    cleanup()
  })

  it("dispatches to higher-priority overlapping bindings", () => {
    const { keymap, host, cleanup } = setup()
    let calledA = false
    let calledB = false

    keymap.registerLayer({
      priority: 10,
      enabled: () => true,
      commands: [
        {
          name: "action.a",
          run: () => {
            calledA = true
          },
        },
      ],
      bindings: [{ key: "s", cmd: "action.a" }],
    })

    keymap.registerLayer({
      priority: 5,
      enabled: () => true,
      commands: [
        {
          name: "action.b",
          run: () => {
            calledB = true
          },
        },
      ],
      bindings: [{ key: "s", cmd: "action.b" }],
    })

    host.press("s")
    expect(calledA).toBe(true)
    expect(calledB).toBe(false)
    cleanup()
  })

  it("dispatches tab to focus.next even without mode gating", () => {
    const { keymap, host, cleanup } = setup()
    let called = false

    keymap.registerLayer({
      commands: [
        {
          name: "focus.next",
          run: () => {
            called = true
          },
        },
      ],
      bindings: [{ key: "tab", cmd: "focus.next" }],
    })

    host.press("tab")
    expect(called).toBe(true)
    cleanup()
  })

  it("escape switches between layers based on app.mode", () => {
    const { keymap, host, cleanup } = setup()
    let helpToggled = false
    let editCancelled = false

    keymap.registerLayer({
      enabled: () =>
        keymap.getData("app.mode") === "base" &&
        keymap.getData("app.overlay") === "none",
      commands: [
        {
          name: "app.help",
          run: () => {
            helpToggled = true
          },
        },
      ],
      bindings: [{ key: "escape", cmd: "app.help" }],
    })

    keymap.registerLayer({
      enabled: () => keymap.getData("app.mode") === "edit",
      commands: [
        {
          name: "edit.cancel",
          run: () => {
            editCancelled = true
          },
        },
      ],
      bindings: [{ key: "escape", cmd: "edit.cancel" }],
    })

    // base mode: escape → app.help (base layer active)
    host.press("escape")
    expect(helpToggled).toBe(true)
    expect(editCancelled).toBe(false)

    // edit mode: escape → edit.cancel (edit layer active, base NOT active)
    helpToggled = false
    keymap.setData("app.mode", "edit")
    host.press("escape")
    expect(editCancelled).toBe(true)
    expect(helpToggled).toBe(false)
    cleanup()
  })

  it("return dispatches request.edit-enter when focus is request", () => {
    const { keymap, host, cleanup } = setup()
    keymap.setData("app.focus", "request")
    let called = false

    keymap.registerLayer({
      enabled: () =>
        keymap.getData("app.mode") === "base" &&
        keymap.getData("app.overlay") === "none",
      commands: [
        {
          name: "request.edit-enter",
          enabled: () => keymap.getData("app.focus") === "request",
          run: () => {
            called = true
          },
        },
      ],
      bindings: [{ key: "return", cmd: "request.edit-enter" }],
    })

    host.press("return")
    expect(called).toBe(true)
    cleanup()
  })

  it("return does NOT dispatch request.edit-enter when focus is sidebar", () => {
    const { keymap, host, cleanup } = setup()
    keymap.setData("app.focus", "sidebar")
    let called = false

    keymap.registerLayer({
      enabled: () =>
        keymap.getData("app.mode") === "base" &&
        keymap.getData("app.overlay") === "none",
      commands: [
        {
          name: "request.edit-enter",
          enabled: () => keymap.getData("app.focus") === "request",
          run: () => {
            called = true
          },
        },
      ],
      bindings: [{ key: "return", cmd: "request.edit-enter" }],
    })

    host.press("return")
    expect(called).toBe(false)
    cleanup()
  })

  it("intercept 'key' with high priority can consume before layers", () => {
    const { keymap, host, cleanup } = setup()
    let layerCalled = false
    let interceptCalled = false

    keymap.registerLayer({
      commands: [
        {
          name: "request.send",
          run: () => {
            layerCalled = true
          },
        },
      ],
      bindings: [{ key: "s", cmd: "request.send" }],
    })

    keymap.intercept(
      "key",
      (ctx) => {
        if (ctx.event.name === "s") {
          interceptCalled = true
          ctx.event.preventDefault()
          ctx.event.stopPropagation()
        }
      },
      { priority: 100 },
    )

    host.press("s")
    expect(interceptCalled).toBe(true)
    expect(layerCalled).toBe(false)
    cleanup()
  })
})

describe("App.tsx layer mirror", () => {
  it("full 4-layer setup dispatches correctly", () => {
    const { keymap, host, cleanup } = setup()
    let sendCalled = false
    let editEnter = false
    let browseEnter = false
    let editCommit = false
    let editCancel = false
    let browseTabCalled: boolean

    // Always-on layer
    keymap.registerLayer({
      commands: [
        { name: "focus.next", run: () => {} },
        { name: "focus.prev", run: () => {} },
      ],
      bindings: [
        { key: "tab", cmd: "focus.next" },
        { key: "shift+tab", cmd: "focus.prev" },
      ],
    })

    // Base layer
    keymap.registerLayer({
      enabled: () =>
        keymap.getData("app.mode") === "base" &&
        keymap.getData("app.overlay") === "none",
      commands: [
        {
          name: "request.send",
          enabled: () => keymap.getData("app.focus") !== "urlbar",
          run: () => {
            sendCalled = true
          },
        },
        {
          name: "request.edit-enter",
          enabled: () => keymap.getData("app.focus") === "request",
          run: () => {
            editEnter = true
          },
        },
      ],
      bindings: [
        { key: "s", cmd: "request.send" },
        { key: "return", cmd: "request.edit-enter" },
      ],
    })

    // Browse layer
    keymap.registerLayer({
      enabled: () => keymap.getData("app.mode") === "browse",
      commands: [
        {
          name: "browse.enter",
          run: () => {
            browseEnter = true
          },
        },
      ],
      bindings: [{ key: "return", cmd: "browse.enter" }],
    })

    // Edit layer
    keymap.registerLayer({
      enabled: () => keymap.getData("app.mode") === "edit",
      commands: [
        {
          name: "edit.commit",
          run: () => {
            editCommit = true
          },
        },
        {
          name: "edit.cancel",
          run: () => {
            editCancel = true
          },
        },
        {
          name: "edit.tab",
          run: () => {
            browseTabCalled = true
          },
        },
      ],
      bindings: [
        { key: "return", cmd: "edit.commit" },
        { key: "escape", cmd: "edit.cancel" },
        { key: "tab", cmd: "edit.tab" },
      ],
    })

    // s in sidebar → send
    keymap.setData("app.focus", "sidebar")
    host.press("s")
    expect(sendCalled).toBe(true)
    sendCalled = false

    // s in urlbar → does NOT send (command disabled)
    keymap.setData("app.focus", "urlbar")
    host.press("s")
    expect(sendCalled).toBe(false)

    // Enter in request → edit-enter
    keymap.setData("app.focus", "request")
    host.press("return")
    expect(editEnter).toBe(true)

    // Enter in sidebar → nothing
    keymap.setData("app.focus", "sidebar")
    host.press("return")
    expect(editEnter).toBe(true) // still true from before
    editEnter = false
    host.press("return")
    expect(editEnter).toBe(false)

    // Mode: browse → Enter dispatches browse.enter
    keymap.setData("app.mode", "browse")
    host.press("return")
    expect(browseEnter).toBe(true)
    expect(sendCalled).toBe(false) // base layer inactive

    // Mode: edit → escape dispatches edit.cancel
    keymap.setData("app.mode", "edit")
    host.press("escape")
    expect(editCancel).toBe(true)

    // Mode: edit → Enter dispatches edit.commit
    host.press("return")
    expect(editCommit).toBe(true)

    // Mode: edit → Tab dispatches edit.tab (browseTab)
    editCancel = false
    browseTabCalled = false
    keymap.setData("app.mode", "edit")
    host.press("tab")
    expect(browseTabCalled).toBe(true)
    expect(editCancel).toBe(false)

    // Overlay blocks base layer
    keymap.setData("app.mode", "base")
    keymap.setData("app.overlay", "help")
    keymap.setData("app.focus", "sidebar")
    host.press("s")
    expect(sendCalled).toBe(false)

    cleanup()
  })
})
