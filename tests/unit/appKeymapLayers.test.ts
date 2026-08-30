import { describe, expect, it } from "bun:test"
import { act, createElement, useEffect, useState } from "react"
import type { CliRenderer } from "@opentui/core"
import { createTestKeymap } from "@opentui/keymap/testing"
import {
  registerDefaultKeys,
  registerEnabledFields,
} from "@opentui/keymap/addons"
import type { UseBindingsLayer } from "@opentui/keymap/react"
import { KeymapProvider } from "@opentui/keymap/react"
import type { KeymapProviderProps } from "@opentui/keymap/react"
import { RendererProvider } from "../../src/ui/RendererContext"
import { bindingDefaults } from "../../src/ui/keybind"
import type { Keybinds } from "../../src/ui/keybind"
import { createAppKeymapLayers } from "../../src/ui/keymap/layers"
import type { AppKeymapContext } from "../../src/ui/keymap/types"
import { useAppKeymap } from "../../src/ui/useAppKeymap"
import { createTestRender } from "../testRender"

const testRender = createTestRender()

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
    requestToggle: 0,
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
    collectionErrorDelete: 0,
    collectionErrorSave: 0,
    focus: "",
    view: "",
    jumpMode: false,
    settingsOpened: false,
    cookieExpand: 0,
    cookieEdit: 0,
    runnerClose: 0,
    runnerFailFast: 0,
    runnerRun: 0,
    runnerOptionFirst: 0,
    runnerOptionLast: 0,
    runnerOptionDown: 0,
    runnerOptionIndex: -1,
    runnerConfigure: 0,
    runnerResults: 0,
    runnerResultOpen: 0,
    runnerTagFilterOpen: [] as Array<"include" | "exclude">,
    runnerTagFilterSet: [] as Array<{
      filter: "include" | "exclude"
      value: string
    }>,
    cookieDelete: [] as Array<{
      kind: string
      domain?: string
      name?: string
      path?: string
    }>,
  }
  const request = {
    ebRef: {
      current: {
        editState: {
          mode: "inactive",
          cursor: { field: "body", row: -1, addingRow: false },
        },
        toggleFormRowType: () => calls.formType++,
        toggleRow: () => calls.requestToggle++,
        commitEdit: () => calls.requestCommit++,
        canEnterTextBodyEditor: false,
        isEditingTextBody: false,
        enterTextBodyEditor: () => calls.jsonEnter++,
        leaveTextBodyEditor: () => calls.jsonLeave++,
        returnToTextBodyTypeSelect: () => calls.jsonReturnToSelect++,
      },
    },
    trySendRef: { current: () => calls.send++ },
    collectionErrorDeleteRef: {
      current: () => calls.collectionErrorDelete++,
    },
    collectionErrorSaveRef: {
      current: () => calls.collectionErrorSave++,
    },
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
    setCookieDeletePending: (pending: {
      kind: string
      domain?: string
      name?: string
      path?: string
    }) => {
      calls.cookieDelete.push(pending)
    },
    retryCookieStorage: () => {},
  }
  const runner = {
    runnerRef: {
      current: {
        phase: "configure",
        selectOpen: false,
        result: null,
        resultRows: [],
        resultIndex: 0,
        resultDetails: new Map(),
        canRun: true,
        optionIndex: 0,
        includeTag: "",
        excludeTag: "",
        setOptionIndex: (index: number) => {
          calls.runnerOptionIndex = index
        },
        run: () => calls.runnerRun++,
        optionDown: () => calls.runnerOptionDown++,
        optionFirst: () => calls.runnerOptionFirst++,
        optionLast: () => calls.runnerOptionLast++,
        setTagFilter: (filter: "include" | "exclude", value: string) =>
          calls.runnerTagFilterSet.push({ filter, value }),
        toggleFailFast: () => calls.runnerFailFast++,
        resultUp: () => {},
        resultDown: () => {},
        resultFirst: () => {},
        resultLast: () => {},
        showConfigure: () => calls.runnerConfigure++,
        showResults: () => calls.runnerResults++,
      },
    },
    detailScrollRef: { current: null },
    close: () => calls.runnerClose++,
    openTagFilter: (filter: "include" | "exclude") =>
      calls.runnerTagFilterOpen.push(filter),
    openResultDetail: () => calls.runnerResultOpen++,
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
    runner,
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

function KeymapHarness({
  context,
  onKeybindsChange,
}: {
  context: AppKeymapContext
  onKeybindsChange: (update: (keybinds: Keybinds) => void) => void
}) {
  const [keybinds, setKeybinds] = useState(context.keybinds)
  useEffect(() => {
    onKeybindsChange((next) => setKeybinds(next))
  }, [onKeybindsChange])
  useAppKeymap({
    runtime: {
      keybinds,
      collectionDir: context.collectionDir,
      confirmUndoAll: context.confirmUndoAll,
    },
    global: context.global,
    request: context.request,
    folder: context.folder,
    environment: context.environment,
    cookies: context.cookies,
    runner: context.runner,
  })
  return null
}

function firstCommandName(layer: UseBindingsLayer): string | undefined {
  return (layer.commands as unknown as Array<{ name: string }>)[0]?.name
}

describe("app keymap layers", () => {
  it("keeps the production layer order", () => {
    const { keymap, cleanup } = setup()
    const { context } = createContext(keymap)

    const layers = createAppKeymapLayers(context)

    expect(layers).toHaveLength(17)
    expect(firstCommandName(layers[0])).toBe("focus.next")
    expect(firstCommandName(layers[1])).toBe("urlbar.tab")
    expect(firstCommandName(layers[2])).toBe("env.picker-open")
    expect(firstCommandName(layers[5])).toBe("folder.edit-enter")
    expect(firstCommandName(layers[9])).toBe("edit.commit")
    expect(firstCommandName(layers[10])).toBe("env.save")
    expect(firstCommandName(layers[13])).toBe("cookie.close")
    expect(firstCommandName(layers[14])).toBe("cookie.filter.exit")
    expect(firstCommandName(layers[15])).toBe("cookie.up")
    expect(firstCommandName(layers[16])).toBe("runner.up")
    cleanup()
  })

  it("keeps Ctrl+W for primary items and Ctrl+D for secondary rows", () => {
    const { keymap, cleanup } = setup()
    const { context } = createContext(keymap)
    const layers = createAppKeymapLayers(context)
    const bindings = (index: number) =>
      layers[index]!.bindings as Array<{ key: string; cmd: string }>

    expect(bindings(2)).toContainEqual({
      key: "ctrl+w",
      cmd: "request.delete",
    })
    expect(bindings(4)).toContainEqual({
      key: "ctrl+d",
      cmd: "browse.delete",
    })
    expect(bindings(6)).toContainEqual({
      key: "ctrl+w",
      cmd: "folder.delete",
    })
    expect(bindings(7)).toContainEqual({
      key: "ctrl+d",
      cmd: "folder-browse.revert-field",
    })
    expect(bindings(10)).toContainEqual({
      key: "ctrl+w",
      cmd: "env.delete",
    })
    expect(bindings(11)).toContainEqual({
      key: "ctrl+d",
      cmd: "env-browse.revert",
    })
    expect(bindings(13)).toContainEqual({
      key: "ctrl+w",
      cmd: "cookie.delete",
    })
    expect(bindings(13)).toContainEqual({
      key: "ctrl+d",
      cmd: "cookie.delete-cookie",
    })
    cleanup()
  })

  it("dispatches browse Space to the active request row toggle", () => {
    const { keymap, host, cleanup } = setup()
    const { context, calls } = createContext(keymap)
    context.request.ebRef.current.editState.mode = "browsing"
    keymap.setData("app.mode", "browse")
    keymap.setData("app.focus", "request")
    context.global.focusRef.current = "request"
    const disposers = register(context)

    host.press("space")
    expect(calls.requestToggle).toBe(1)

    disposers.forEach((dispose) => dispose())
    cleanup()
  })

  it("handles Runner navigation and ignores Escape while a run is active", () => {
    const { keymap, host, cleanup } = setup()
    const { context, calls } = createContext(keymap)
    keymap.setData("app.view", "runner")
    keymap.setData("app.focus", "runner-options")
    context.global.viewRef.current = "runner"
    context.global.focusRef.current = "runner-options"
    const disposers = register(context)

    host.press("down")
    host.press("home")
    host.press("end")
    context.runner.runnerRef.current.optionIndex = 1
    host.press("return")
    context.runner.runnerRef.current.optionIndex = 2
    host.press("return")
    context.runner.runnerRef.current.optionIndex = 3
    host.press("return")
    host.press("r")
    host.press("space")
    host.press("tab")
    host.press("escape")
    expect(calls.runnerOptionDown).toBe(1)
    expect(calls.runnerOptionFirst).toBe(1)
    expect(calls.runnerOptionLast).toBe(1)
    expect(calls.runnerTagFilterOpen).toEqual(["include", "exclude"])
    expect(calls.runnerFailFast).toBe(2)
    expect(calls.runnerRun).toBe(1)
    expect(calls.focus).toBe("runner-requests")
    expect(calls.runnerClose).toBe(1)

    context.runner.runnerRef.current.phase = "running"
    host.press("escape")
    expect(calls.runnerClose).toBe(1)

    disposers.forEach((dispose) => dispose())
    cleanup()
  })

  it("uses the Requests pane to open executed result rows", () => {
    const { keymap, host, cleanup } = setup()
    const { context, calls } = createContext(keymap)
    keymap.setData("app.view", "runner")
    keymap.setData("app.focus", "runner-requests")
    context.global.viewRef.current = "runner"
    context.global.focusRef.current = "runner-requests"
    context.runner.runnerRef.current.phase = "results"
    context.runner.runnerRef.current.resultRows = [
      {
        kind: "result",
        id: "health",
        result: {
          id: "health",
          method: "GET",
          url: "https://example.com/health",
          ok: true,
          failureCategories: [],
          captures: { evaluated: false, results: [] },
          assertions: { evaluated: false, results: [] },
        },
      },
    ]
    context.runner.runnerRef.current.resultDetails = new Map([
      [
        "health",
        {
          requestId: "health",
          entry: {
            timestamp: 1,
            request: {
              id: "health",
              name: "Health",
              method: "GET",
              url: "https://example.com/health",
              headers: {},
              params: [],
            },
          },
        },
      ],
    ])
    const disposers = register(context)

    host.press("return")
    host.press("space")
    expect(calls.runnerResultOpen).toBe(1)

    context.runner.runnerRef.current.resultRows = [
      { kind: "skipped", id: "health", reason: "fail-fast" },
    ]
    host.press("return")
    expect(calls.runnerResultOpen).toBe(1)

    disposers.forEach((dispose) => dispose())
    cleanup()
  })

  it("moves Tab only between Runner panes and blocks it for an open select or run", () => {
    const { keymap, host, cleanup } = setup()
    const { context, calls } = createContext(keymap)
    keymap.setData("app.view", "runner")
    keymap.setData("app.focus", "runner-options")
    context.global.viewRef.current = "runner"
    context.global.focusRef.current = "runner-options"
    context.runner.runnerRef.current.optionIndex = 1
    const disposers = register(context)

    host.press("r")
    host.press("space")
    context.runner.runnerRef.current.result = {
      results: [],
      skipped: [],
      failed: false,
      summary: {
        selected: 0,
        executed: 0,
        skipped: 0,
        requestSuccesses: 0,
        requestFailures: 0,
        assertionPasses: 0,
        assertionFailures: 0,
        captureFailures: 0,
        durationMs: 0,
        failureCategories: [],
      },
    }
    host.press("left")
    host.press("right")
    expect(calls.runnerRun).toBe(1)
    expect(calls.runnerFailFast).toBe(0)
    expect(calls.runnerConfigure).toBe(0)
    expect(calls.runnerResults).toBe(0)

    host.press("tab")
    expect(calls.focus).toBe("runner-requests")
    context.global.focusRef.current = "runner-requests"
    host.press("tab", { shift: true })
    expect(calls.focus).toBe("runner-options")

    context.runner.runnerRef.current.phase = "results"
    context.global.focusRef.current = "runner-requests"
    host.press("tab")
    expect(calls.focus).toBe("runner-options")
    context.global.focusRef.current = "runner-options"
    host.press("tab")
    expect(calls.focus).toBe("runner-requests")

    calls.focus = ""
    context.runner.runnerRef.current.selectOpen = false
    context.runner.runnerRef.current.phase = "running"
    host.press("tab")
    host.press("tab", { shift: true })
    expect(calls.focus).toBe("")

    context.runner.runnerRef.current.phase = "configure"
    context.runner.runnerRef.current.selectOpen = true
    host.press("tab")
    host.press("tab", { shift: true })
    expect(calls.focus).toBe("")

    disposers.forEach((dispose) => dispose())
    cleanup()
  })

  it("clears only the selected Runner tag filter with Ctrl+D", () => {
    const { keymap, host, cleanup } = setup()
    const { context, calls } = createContext(keymap)
    keymap.setData("app.view", "runner")
    keymap.setData("app.focus", "runner-options")
    context.global.viewRef.current = "runner"
    context.global.focusRef.current = "runner-options"
    context.runner.runnerRef.current.includeTag = "smoke"
    context.runner.runnerRef.current.excludeTag = "slow"
    const disposers = register(context)

    context.runner.runnerRef.current.optionIndex = 1
    host.press("d", { ctrl: true })
    context.runner.runnerRef.current.optionIndex = 2
    host.press("d", { ctrl: true })
    expect(calls.runnerTagFilterSet).toEqual([
      { filter: "include", value: "" },
      { filter: "exclude", value: "" },
    ])

    keymap.setData("app.overlay", "tag-editor")
    host.press("d", { ctrl: true })
    expect(calls.runnerTagFilterSet).toHaveLength(2)

    disposers.forEach((dispose) => dispose())
    cleanup()
  })

  it("does not switch Runner pages before results exist", () => {
    const { keymap, host, cleanup } = setup()
    const { context, calls } = createContext(keymap)
    keymap.setData("app.view", "runner")
    keymap.setData("app.focus", "runner-requests")
    context.global.viewRef.current = "runner"
    context.global.focusRef.current = "runner-requests"
    const disposers = register(context)

    host.press("left")
    host.press("right")
    expect(calls.focus).toBe("")

    disposers.forEach((dispose) => dispose())
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
      key: "ctrl+alt+w",
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

  it("uses Ctrl+W for the primary domain and Ctrl+D for its cookie", () => {
    const { keymap, host, cleanup } = setup()
    const { context, calls } = createContext(keymap)
    context.cookies.cookieJarViewRef.current.domains = [
      { domain: "example.com", count: 1 },
    ]
    context.cookies.cookieJarViewRef.current.selectedDomain = "example.com"
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
    keymap.setData("app.overlay", "none")
    const disposers = register(context)

    keymap.setData("app.focus", "cookie-sidebar")
    host.press("w", { ctrl: true })
    keymap.setData("app.focus", "cookie-list")
    host.press("d", { ctrl: true })

    expect(calls.cookieDelete).toEqual([
      { kind: "domain", domain: "example.com" },
      { kind: "cookie", name: "session", domain: "example.com", path: "/" },
    ])
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

  it("commits and sends assertion and capture edits", () => {
    const { keymap, host, cleanup } = setup()
    const { context, calls } = createContext(keymap)
    const editState = context.request.ebRef.current.editState
    context.global.focusRef.current = "request"
    keymap.setData("app.focus", "request")
    keymap.setData("app.mode", "edit")
    const disposers = register(context)

    for (const field of ["assertions", "captures"] as const) {
      editState.mode = "editing"
      editState.cursor.field = field
      host.press("return", { ctrl: true })
    }

    expect(calls.requestCommit).toBe(2)
    expect(calls.send).toBe(2)
    disposers.forEach((dispose) => dispose())
    cleanup()
  })

  it("routes collection error delete and save through the existing commands", () => {
    const { keymap, host, cleanup } = setup()
    const { context, calls } = createContext(keymap)
    context.keybinds = { ...context.keybinds, request_save: "ctrl+x" }
    context.global.modeRef.current = "invalid"
    keymap.setData("app.mode", "edit")
    const disposers = register(context)

    host.press("w", { ctrl: true })
    expect(calls.collectionErrorDelete).toBe(1)
    expect(keymap.dispatchCommand("request.delete")).toMatchObject({
      ok: true,
    })
    expect(calls.collectionErrorDelete).toBe(2)

    keymap.setData("app.focus", "folder")
    host.press("s", { ctrl: true })
    expect(calls.collectionErrorSave).toBe(0)
    host.press("x", { ctrl: true })
    expect(calls.collectionErrorSave).toBe(1)
    expect(keymap.dispatchCommand("folder.save")).toMatchObject({ ok: true })
    expect(calls.collectionErrorSave).toBe(2)

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

  it("refreshes settings shortcuts without remounting the keymap", async () => {
    const { keymap, host, cleanup } = setup()
    const { context, calls } = createContext(keymap)
    let updateKeybinds: ((keybinds: Keybinds) => void) | undefined
    const render = await testRender(
      createElement(RendererProvider, {
        renderer: {} as CliRenderer,
        children: createElement(KeymapProvider, {
          keymap: keymap as unknown as KeymapProviderProps["keymap"],
          children: createElement(KeymapHarness, {
            context,
            onKeybindsChange: (update) => {
              updateKeybinds = update
            },
          }),
        }),
      }),
      { width: 80, height: 24 },
    )
    await render.renderOnce()

    host.press("f4")
    expect(calls.settingsOpened).toBe(true)
    calls.settingsOpened = false

    await act(() => {
      updateKeybinds!({ ...context.keybinds, settings_open: "f5" })
    })
    await render.renderOnce()

    host.press("f4")
    expect(calls.settingsOpened).toBe(false)
    host.press("f5")
    expect(calls.settingsOpened).toBe(true)

    cleanup()
  })

  it("leaves Cookies unbound until the user configures a shortcut", () => {
    const { keymap, host, cleanup } = setup()
    const { context, calls } = createContext(keymap)
    const defaultBindings = createAppKeymapLayers(context)[0]!
      .bindings as Array<{
      key: string
      cmd: string
    }>
    expect(defaultBindings).not.toContainEqual({
      key: "",
      cmd: "cookie-jar.open",
    })

    context.keybinds = { ...context.keybinds, cookie_jar_open: "ctrl+shift+c" }
    const disposers = register(context)
    host.press("c", { ctrl: true, shift: true })

    expect(calls.view).toBe("cookie-jar")
    expect(calls.focus).toBe("cookie-sidebar")
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

  it("moves from the collection error list to its YAML editor", () => {
    const { keymap, host, cleanup } = setup()
    const { context, calls } = createContext(keymap)
    context.folder.folderViewRef.current = true
    context.global.focusRef.current = "sidebar"
    context.global.modeRef.current = "invalid"
    keymap.setData("app.mode", "edit")
    keymap.setData("app.focus", "sidebar")
    const disposers = register(context)

    host.press("tab")

    expect(calls.focus).toBe("folder")
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
    context.request.ebRef.current.canEnterTextBodyEditor = true
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
    context.request.ebRef.current.canEnterTextBodyEditor = true
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
    context.request.ebRef.current.isEditingTextBody = true
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
    context.request.ebRef.current.isEditingTextBody = true
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
    context.request.ebRef.current.isEditingTextBody = true
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
    context.request.ebRef.current.isEditingTextBody = true
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
