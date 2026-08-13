import { describe, expect, it } from "bun:test"
import { createTestKeymap } from "@opentui/keymap/testing"
import {
  registerDefaultKeys,
  registerEnabledFields,
} from "@opentui/keymap/addons"
import type { UseBindingsLayer } from "@opentui/keymap/react"
import { bindingDefaults } from "../../src/ui/keybind"
import { createAppKeymapLayers } from "../../src/ui/keymap/layers"
import type { AppKeymapContext } from "../../src/ui/keymap/types"

function setup() {
  const { keymap, host, cleanup: hostCleanup } = createTestKeymap()
  const disposeEnabled = registerEnabledFields(keymap)
  const disposeKeys = registerDefaultKeys(keymap)
  keymap.setData("app.mode", "base")
  keymap.setData("app.focus", "sidebar")
  keymap.setData("app.overlay", "none")
  keymap.setData("app.view", "main")
  keymap.setData("app.jump", "none")
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

function createContext(keymap: ReturnType<typeof createTestKeymap>["keymap"]) {
  const calls = {
    send: 0,
    formType: 0,
    requestCommit: 0,
    folderUp: 0,
    folderCommit: 0,
    envSave: 0,
    envUp: 0,
    editorOpened: "",
    newEnvironment: false,
    environmentPicker: false,
    jsonEnter: 0,
    jsonLeave: 0,
    jsonReturnToSelect: 0,
    focus: "",
    view: "",
    jumpMode: false,
    settingsOpened: false,
    cookieExpand: 0,
    cookieEdit: 0,
  }
  const request = {
    ebRef: {
      current: {
        editState: {
          mode: "inactive",
          cursor: { field: "body", row: -1, addingRow: false },
        },
        toggleFormRowType: () => calls.formType++,
        commitEdit: () => calls.requestCommit++,
        canEnterJsonBodyEditor: false,
        isEditingJsonBody: false,
        enterJsonBodyEditor: () => calls.jsonEnter++,
        leaveJsonBodyEditor: () => calls.jsonLeave++,
        returnToJsonBodyTypeSelect: () => calls.jsonReturnToSelect++,
      },
    },
    trySendRef: { current: () => calls.send++ },
  }
  const folder = {
    folderEbRef: {
      current: {
        browseUp: () => calls.folderUp++,
        commitEdit: () => calls.folderCommit++,
      },
    },
    folderViewRef: { current: false },
  }
  const environment = {
    envStateRef: {
      current: { activeEnv: { name: "development" } },
    },
    envEditorRef: {
      current: {
        dirty: false,
        save: () => calls.envSave++,
        browseUp: () => calls.envUp++,
        openEditor: (name: string) => {
          calls.editorOpened = name
        },
      },
    },
    setNewEnvironmentVisible: (visible: boolean) => {
      calls.newEnvironment = visible
    },
  }
  const cookies = {
    cookieJarViewRef: {
      current: {
        domains: [],
        cookies: [],
        selectedDomain: null,
        cookieIndex: 0,
        filtering: false,
        domainUp: () => {},
        domainDown: () => {},
        cookieUp: () => {},
        cookieDown: () => {},
        toggleCookieExpanded: () => calls.cookieExpand++,
        deleteSelectedCookie: () => {},
        deleteSelectedDomain: () => {},
        clearAll: () => {},
      },
    },
    setCookieFormVisible: (visible: boolean) => {
      if (visible) calls.cookieEdit++
    },
    setCookieFormInitial: () => {},
    setCookieDeletePending: () => {},
    retryCookieStorage: () => {},
  }
  const context = {
    keymap,
    renderer: {},
    keybinds: bindingDefaults(),
    collectionDir: "/tmp/collection",
    confirmUndoAll: false,
    global: {
      modeRef: { current: "collection" },
      focusRef: { current: "sidebar" },
      headerFieldRef: { current: "name" },
      urlbarSubFocusRef: { current: "select" },
      viewRef: { current: "main" },
      expandedRef: { current: null },
      responseQueryRef: { current: null },
      setFocus: (focus: string) => {
        calls.focus = focus
      },
      setView: (view: string) => {
        calls.view = view
      },
      setJumpMode: (jumpMode: boolean) => {
        calls.jumpMode = jumpMode
      },
      openSettingsView: () => {
        calls.settingsOpened = true
      },
      setEnvironmentPickerVisible: (visible: boolean) => {
        calls.environmentPicker = visible
      },
      setUrlbarSubFocus: () => {},
    },
    request,
    folder,
    environment,
    cookies,
    actions: {
      trySendRef: request.trySendRef,
      envStateRef: environment.envStateRef,
      envEditorRef: environment.envEditorRef,
      focusedFolderPathRef: { current: null },
    },
  } as unknown as AppKeymapContext
  return { context, calls }
}

function register(context: AppKeymapContext) {
  return createAppKeymapLayers(context).map((layer) =>
    context.keymap.registerLayer(layer),
  )
}

function firstCommandName(layer: UseBindingsLayer): string | undefined {
  return (layer.commands as unknown as Array<{ name: string }>)[0]?.name
}

describe("app keymap layers", () => {
  it("keeps the production layer order", () => {
    const { keymap, cleanup } = setup()
    const { context } = createContext(keymap)

    const layers = createAppKeymapLayers(context)

    expect(layers).toHaveLength(16)
    expect(firstCommandName(layers[0])).toBe("focus.next")
    expect(firstCommandName(layers[1])).toBe("urlbar.tab")
    expect(firstCommandName(layers[2])).toBe("env.picker-open")
    expect(firstCommandName(layers[5])).toBe("folder.edit-enter")
    expect(firstCommandName(layers[9])).toBe("edit.commit")
    expect(firstCommandName(layers[10])).toBe("env.save")
    expect(firstCommandName(layers[13])).toBe("cookie.close")
    expect(firstCommandName(layers[14])).toBe("cookie.filter.exit")
    expect(firstCommandName(layers[15])).toBe("cookie.up")
    cleanup()
  })

  it("uses Enter to expand, Ctrl+E to edit, and keeps clone non-destructive", () => {
    const { keymap, host, cleanup } = setup()
    const { context, calls } = createContext(keymap)
    context.cookies.cookieJarViewRef.current.cookies = [
      {
        name: "session",
        value: "abc",
        domain: "example.com",
        path: "/",
        expires: null,
        secure: false,
        httpOnly: false,
        hostOnly: true,
      },
    ]
    keymap.setData("app.view", "cookie-jar")
    keymap.setData("app.focus", "cookie-list")
    const disposers = register(context)
    host.press("return")
    host.press("e", { ctrl: true })
    expect(calls.cookieExpand).toBe(1)
    expect(calls.cookieEdit).toBe(1)

    const cookieBindings = createAppKeymapLayers(context)[13]!
      .bindings as Array<{ key: string; cmd: string }>

    expect(cookieBindings).toContainEqual({
      key: "ctrl+e",
      cmd: "cookie.edit",
    })
    expect(cookieBindings).toContainEqual({
      key: "ctrl+w",
      cmd: "cookie.delete",
    })
    expect(cookieBindings).toContainEqual({
      key: "ctrl+shift+w",
      cmd: "cookie.clear",
    })
    expect(cookieBindings).not.toContainEqual({
      key: "ctrl+k",
      cmd: "cookie.clear",
    })
    expect(cookieBindings).not.toContainEqual({
      key: "return",
      cmd: "cookie.edit",
    })
    disposers.forEach((dispose) => dispose())
    cleanup()
  })

  it("dispatches request send from the production base layer", () => {
    const { keymap, host, cleanup } = setup()
    const { context, calls } = createContext(keymap)
    const disposers = register(context)

    host.press("linefeed")

    expect(calls.send).toBe(1)
    disposers.forEach((dispose) => dispose())
    cleanup()
  })

  it("opens the environment picker with e from the sidebar", () => {
    const { keymap, host, cleanup } = setup()
    const { context, calls } = createContext(keymap)
    const disposers = register(context)

    host.press("e")

    expect(calls.environmentPicker).toBe(true)
    disposers.forEach((dispose) => dispose())
    cleanup()
  })

  it("does not open the environment picker with e outside the sidebar", () => {
    const { keymap, host, cleanup } = setup()
    const { context, calls } = createContext(keymap)
    keymap.setData("app.focus", "request")
    const disposers = register(context)

    host.press("e")

    expect(calls.environmentPicker).toBe(false)
    disposers.forEach((dispose) => dispose())
    cleanup()
  })

  it("opens the environment editor with f3 from any pane or input mode", () => {
    const { keymap, host, cleanup } = setup()
    const { context, calls } = createContext(keymap)
    keymap.setData("app.focus", "request")
    keymap.setData("app.mode", "edit")
    const disposers = register(context)

    host.press("f3")

    expect(calls.editorOpened).toBe("development")
    expect(calls.view).toBe("env-editor")
    expect(calls.focus).toBe("env-sidebar")
    disposers.forEach((dispose) => dispose())
    cleanup()
  })

  it("opens settings with f4 and blocks a dirty environment editor", () => {
    const { keymap, host, cleanup } = setup()
    const { context, calls } = createContext(keymap)
    const disposers = register(context)

    host.press("f4")
    expect(calls.settingsOpened).toBe(true)

    calls.settingsOpened = false
    context.global.viewRef.current = "env-editor"
    context.environment.envEditorRef.current.dirty = true
    host.press("f4")
    expect(calls.settingsOpened).toBe(false)

    disposers.forEach((dispose) => dispose())
    cleanup()
  })

  it("dispatches a live settings shortcut override instead of the old key", () => {
    const { keymap, host, cleanup } = setup()
    const { context, calls } = createContext(keymap)
    context.keybinds = { ...context.keybinds, settings_open: "f5" }
    const disposers = register(context)

    host.press("f4")
    expect(calls.settingsOpened).toBe(false)
    host.press("f5")
    expect(calls.settingsOpened).toBe(true)

    disposers.forEach((dispose) => dispose())
    cleanup()
  })

  it("does not dispatch printable global shortcuts while typing", () => {
    const { keymap, host, cleanup } = setup()
    const { context, calls } = createContext(keymap)
    context.keybinds = { ...context.keybinds, settings_open: "x" }
    keymap.setData("app.mode", "edit")
    const disposers = register(context)

    host.press("x")

    expect(calls.settingsOpened).toBe(false)
    disposers.forEach((dispose) => dispose())
    cleanup()
  })

  it("does not enter jump mode while typing in settings", () => {
    const { keymap, host, cleanup } = setup()
    const { context, calls } = createContext(keymap)
    keymap.setData("app.view", "settings")
    keymap.setData("app.focus", "settings-content")
    keymap.setData("app.text-input", true)
    context.global.viewRef.current = "settings"
    context.global.focusRef.current = "settings-content"
    const disposers = register(context)

    host.press("g")

    expect(calls.jumpMode).toBe(false)
    disposers.forEach((dispose) => dispose())
    cleanup()
  })

  it("cycles settings focus and suppresses background request commands", () => {
    const { keymap, host, cleanup } = setup()
    const { context, calls } = createContext(keymap)
    keymap.setData("app.view", "settings")
    keymap.setData("app.focus", "settings-sidebar")
    context.global.viewRef.current = "settings"
    context.global.focusRef.current = "settings-sidebar"
    const disposers = register(context)

    host.press("tab")
    host.press("linefeed")
    host.press("s", { ctrl: true })
    host.press("f3")

    expect(calls.focus).toBe("settings-content")
    expect(calls.send).toBe(0)
    expect(calls.envSave).toBe(0)
    expect(calls.editorOpened).toBe("")

    disposers.forEach((dispose) => dispose())
    cleanup()
  })

  it("focuses the environment sidebar without reopening an active editor", () => {
    const { keymap, host, cleanup } = setup()
    const { context, calls } = createContext(keymap)
    keymap.setData("app.view", "env-editor")
    context.global.viewRef.current = "env-editor"
    const disposers = register(context)

    host.press("f3")

    expect(calls.editorOpened).toBe("")
    expect(calls.view).toBe("")
    expect(calls.focus).toBe("env-sidebar")
    disposers.forEach((dispose) => dispose())
    cleanup()
  })

  it("opens the editor and closes the environment picker with f3", () => {
    const { keymap, host, cleanup } = setup()
    const { context, calls } = createContext(keymap)
    calls.environmentPicker = true
    keymap.setData("app.overlay", "environment-picker")
    const disposers = register(context)

    host.press("f3")

    expect(calls.environmentPicker).toBe(false)
    expect(calls.editorOpened).toBe("development")
    expect(calls.view).toBe("env-editor")
    expect(calls.focus).toBe("env-sidebar")
    disposers.forEach((dispose) => dispose())
    cleanup()
  })

  it("dispatches only active commands programmatically", () => {
    const { keymap, cleanup } = setup()
    const { context, calls } = createContext(keymap)
    const disposers = register(context)

    expect(keymap.dispatchCommand("request.send")).toMatchObject({ ok: true })
    expect(calls.send).toBe(1)

    keymap.setData("app.mode", "browse")
    expect(keymap.dispatchCommand("request.send")).toMatchObject({
      ok: false,
      reason: "disabled",
    })
    expect(calls.send).toBe(1)

    disposers.forEach((dispose) => dispose())
    cleanup()
  })

  it("blocks request send outside collection mode", () => {
    const { keymap, host, cleanup } = setup()
    const { context, calls } = createContext(keymap)
    context.global.modeRef.current = "browse"
    const disposers = register(context)

    host.press("linefeed")

    expect(calls.send).toBe(0)
    disposers.forEach((dispose) => dispose())
    cleanup()
  })

  it("blocks request send while an overlay is active", () => {
    const { keymap, host, cleanup } = setup()
    const { context, calls } = createContext(keymap)
    keymap.setData("app.overlay", "help")
    const disposers = register(context)

    host.press("linefeed")

    expect(calls.send).toBe(0)
    disposers.forEach((dispose) => dispose())
    cleanup()
  })

  it("blocks YAML editing while an overlay is active", () => {
    const { keymap, cleanup } = setup()
    const { context } = createContext(keymap)
    keymap.setData("app.overlay", "help")
    const disposers = register(context)

    expect(keymap.dispatchCommand("request.edit-yaml")).toMatchObject({
      ok: false,
      reason: "disabled",
    })
    disposers.forEach((dispose) => dispose())
    cleanup()
  })

  it("advances URL bar from method select to URL text", () => {
    const { keymap, host, cleanup } = setup()
    const { context } = createContext(keymap)
    let subFocus = "select"
    context.global.setUrlbarSubFocus = (next) => {
      subFocus = next
    }
    keymap.setData("app.focus", "urlbar")
    const disposers = register(context)

    host.press("tab")

    expect(subFocus).toBe("text")
    disposers.forEach((dispose) => dispose())
    cleanup()
  })

  it("prefers request browse form toggle over theme picker", () => {
    const { keymap, host, cleanup } = setup()
    const { context, calls } = createContext(keymap)
    context.request.ebRef.current.editState.mode = "browsing"
    keymap.setData("app.mode", "browse")
    keymap.setData("app.focus", "request")
    const disposers = register(context)

    host.press("t", { ctrl: true })

    expect(calls.formType).toBe(1)
    disposers.forEach((dispose) => dispose())
    cleanup()
  })

  it("dispatches folder browse bindings from the production folder layer", () => {
    const { keymap, host, cleanup } = setup()
    const { context, calls } = createContext(keymap)
    keymap.setData("app.mode", "browse")
    keymap.setData("app.focus", "folder")
    const disposers = register(context)

    host.press("up")

    expect(calls.folderUp).toBe(1)
    disposers.forEach((dispose) => dispose())
    cleanup()
  })

  it("dispatches request edit bindings from the production request layer", () => {
    const { keymap, host, cleanup } = setup()
    const { context, calls } = createContext(keymap)
    keymap.setData("app.mode", "edit")
    keymap.setData("app.focus", "request")
    const disposers = register(context)

    host.press("return")

    expect(calls.requestCommit).toBe(1)
    disposers.forEach((dispose) => dispose())
    cleanup()
  })

  it("enters the JSON body editor from the body type select", () => {
    const { keymap, host, cleanup } = setup()
    const { context, calls } = createContext(keymap)
    context.request.ebRef.current.editState.mode = "browsing"
    context.request.ebRef.current.editState.cursor = {
      field: "body",
      row: 0,
      addingRow: false,
    }
    context.request.ebRef.current.canEnterJsonBodyEditor = true
    keymap.setData("app.mode", "browse")
    keymap.setData("app.focus", "request")
    const disposers = register(context)

    host.press("tab")

    expect(calls.jsonEnter).toBe(1)
    disposers.forEach((dispose) => dispose())
    cleanup()
  })

  it("moves to the previous pane from the JSON body type select on shift+tab", () => {
    const { keymap, host, cleanup } = setup()
    const { context, calls } = createContext(keymap)
    context.request.ebRef.current.editState.mode = "browsing"
    context.request.ebRef.current.editState.cursor = {
      field: "body",
      row: 0,
      addingRow: false,
    }
    context.request.ebRef.current.canEnterJsonBodyEditor = true
    context.global.focusRef.current = "request"
    keymap.setData("app.mode", "browse")
    keymap.setData("app.focus", "request")
    const disposers = register(context)

    host.press("tab", { shift: true })

    expect(calls.jsonEnter).toBe(0)
    expect(calls.focus).toBe("urlbar")
    disposers.forEach((dispose) => dispose())
    cleanup()
  })

  it("leaves the JSON body editor for the next pane on tab", () => {
    const { keymap, host, cleanup } = setup()
    const { context, calls } = createContext(keymap)
    context.request.ebRef.current.editState.mode = "editing"
    context.request.ebRef.current.editState.cursor = {
      field: "body",
      row: 1,
      addingRow: false,
    }
    context.request.ebRef.current.isEditingJsonBody = true
    context.global.focusRef.current = "request"
    keymap.setData("app.mode", "edit")
    keymap.setData("app.focus", "request")
    const disposers = register(context)

    host.press("tab")

    expect(calls.jsonLeave).toBe(1)
    expect(calls.focus).toBe("response")
    disposers.forEach((dispose) => dispose())
    cleanup()
  })

  it("returns the JSON body editor to the body type select on shift+tab", () => {
    const { keymap, host, cleanup } = setup()
    const { context, calls } = createContext(keymap)
    context.request.ebRef.current.editState.mode = "editing"
    context.request.ebRef.current.editState.cursor = {
      field: "body",
      row: 1,
      addingRow: false,
    }
    context.request.ebRef.current.isEditingJsonBody = true
    context.global.focusRef.current = "request"
    keymap.setData("app.mode", "edit")
    keymap.setData("app.focus", "request")
    const disposers = register(context)

    host.press("tab", { shift: true })

    expect(calls.jsonReturnToSelect).toBe(1)
    expect(calls.focus).toBe("")
    disposers.forEach((dispose) => dispose())
    cleanup()
  })

  it("returns the JSON body editor to the body type select on escape", () => {
    const { keymap, host, cleanup } = setup()
    const { context, calls } = createContext(keymap)
    context.request.ebRef.current.editState.mode = "editing"
    context.request.ebRef.current.editState.cursor = {
      field: "body",
      row: 1,
      addingRow: false,
    }
    context.request.ebRef.current.isEditingJsonBody = true
    keymap.setData("app.mode", "edit")
    keymap.setData("app.focus", "request")
    const disposers = register(context)

    host.press("escape")

    expect(calls.jsonReturnToSelect).toBe(1)
    disposers.forEach((dispose) => dispose())
    cleanup()
  })

  it("sends from the JSON body editor with ctrl+enter and ctrl+j", () => {
    const { keymap, host, cleanup } = setup()
    const { context, calls } = createContext(keymap)
    context.request.ebRef.current.editState.mode = "editing"
    context.request.ebRef.current.editState.cursor = {
      field: "body",
      row: 1,
      addingRow: false,
    }
    context.request.ebRef.current.isEditingJsonBody = true
    keymap.setData("app.mode", "edit")
    keymap.setData("app.focus", "request")
    const disposers = register(context)

    host.press("return", { ctrl: true })
    host.press("linefeed")

    expect(calls.send).toBe(2)
    disposers.forEach((dispose) => dispose())
    cleanup()
  })

  it("dispatches folder edit bindings from the production folder layer", () => {
    const { keymap, host, cleanup } = setup()
    const { context, calls } = createContext(keymap)
    keymap.setData("app.mode", "edit")
    keymap.setData("app.focus", "folder")
    const disposers = register(context)

    host.press("return")

    expect(calls.folderCommit).toBe(1)
    disposers.forEach((dispose) => dispose())
    cleanup()
  })

  it("dispatches environment save from the production environment layer", () => {
    const { keymap, host, cleanup } = setup()
    const { context, calls } = createContext(keymap)
    keymap.setData("app.view", "env-editor")
    const disposers = register(context)

    host.press("s", { ctrl: true })

    expect(calls.envSave).toBe(1)
    disposers.forEach((dispose) => dispose())
    cleanup()
  })

  it("opens the new environment overlay from the production layer", () => {
    const { keymap, host, cleanup } = setup()
    const { context, calls } = createContext(keymap)
    keymap.setData("app.view", "env-editor")
    const disposers = register(context)

    host.press("n", { ctrl: true })

    expect(calls.newEnvironment).toBe(true)
    expect(calls.focus).toBe("")
    disposers.forEach((dispose) => dispose())
    cleanup()
  })

  it("blocks environment save outside collection mode", () => {
    const { keymap, host, cleanup } = setup()
    const { context, calls } = createContext(keymap)
    context.global.modeRef.current = "browse"
    keymap.setData("app.view", "env-editor")
    const disposers = register(context)

    host.press("s", { ctrl: true })

    expect(calls.envSave).toBe(0)
    disposers.forEach((dispose) => dispose())
    cleanup()
  })

  it("dispatches environment browse bindings from the production layer", () => {
    const { keymap, host, cleanup } = setup()
    const { context, calls } = createContext(keymap)
    keymap.setData("app.view", "env-editor")
    keymap.setData("app.focus", "env-vars")
    keymap.setData("app.mode", "browse")
    const disposers = register(context)

    host.press("up")

    expect(calls.envUp).toBe(1)
    disposers.forEach((dispose) => dispose())
    cleanup()
  })

  it("enters jump mode from the environment editor outside editable header fields", () => {
    const { keymap, host, cleanup } = setup()
    const { context, calls } = createContext(keymap)
    keymap.setData("app.view", "env-editor")
    keymap.setData("app.focus", "env-sidebar")
    const disposers = register(context)

    host.press("g")

    expect(calls.jumpMode).toBe(true)
    disposers.forEach((dispose) => dispose())
    cleanup()
  })

  it("does not enter jump mode while editing the environment name", () => {
    const { keymap, host, cleanup } = setup()
    const { context, calls } = createContext(keymap)
    keymap.setData("app.view", "env-editor")
    keymap.setData("app.focus", "env-header")
    const disposers = register(context)

    host.press("g")

    expect(calls.jumpMode).toBe(false)
    disposers.forEach((dispose) => dispose())
    cleanup()
  })

  it("does not enter jump mode while editing a response query", () => {
    const { keymap, host, cleanup } = setup()
    const { context, calls } = createContext(keymap)
    const responseQuery = {
      canOpen: () => false,
      open: () => false,
      isOpen: () => true,
    }
    context.global.responseQueryRef.current = responseQuery
    keymap.setData("app.focus", "response")
    const disposers = register(context)

    host.press("g")

    expect(calls.jumpMode).toBe(false)
    disposers.forEach((dispose) => dispose())
    cleanup()
  })

  it("enters jump mode while the environment color select is focused", () => {
    const { keymap, host, cleanup } = setup()
    const { context, calls } = createContext(keymap)
    context.global.headerFieldRef.current = "color"
    keymap.setData("app.view", "env-editor")
    keymap.setData("app.focus", "env-header")
    const disposers = register(context)

    host.press("g")

    expect(calls.jumpMode).toBe(true)
    disposers.forEach((dispose) => dispose())
    cleanup()
  })
})
