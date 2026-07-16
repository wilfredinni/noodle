import { describe, it, expect } from "bun:test"
import type { CliRenderer } from "@opentui/core"
import { buildCommandPaletteCommands } from "../../src/ui/commands"
import type { CommandBuilderContext } from "../../src/ui/commands"
import { bindingDefaults } from "../../src/ui/keybind"
import type { Collection } from "../../src/schema"
import { getEditRequestYamlFile } from "../../src/ui/commandActions"

function minimalContext(): CommandBuilderContext {
  const keybinds = bindingDefaults()
  return {
    keybinds,
    collectionDir: "/tmp/collections",
    confirmUndoAll: false,
    renderer: { copyToClipboardOSC52: () => {} } as unknown as CliRenderer,
    trySendRef: { current: undefined } as never,
    draftRef: { current: null } as never,
    folderDraftRef: { current: null } as never,
    envStateRef: { current: null } as never,
    envEditorRef: { current: null } as never,
    collectionRef: { current: null } as never,
    selectedIdRef: { current: null } as never,
    focusRef: { current: null } as never,
    responseStateRef: { current: null } as never,
    activeIndexRef: { current: 0 } as never,
    savingRef: { current: false } as never,
    doSaveRef: { current: () => {} } as never,
    focusedFolderPathRef: { current: null } as never,
    focusedFolderNameRef: { current: null } as never,
    folderDeletePathRef: { current: null } as never,
    getKeymapFocus: () => "sidebar",
    getView: () => "main",
    setLayout: () => {},
    onLayoutChange: () => {},
    setHelpVisible: () => {},
    setAboutVisible: () => {},
    setNewRequestVisible: () => {},
    setNewFolderVisible: () => {},
    setCloneRequestVisible: () => {},
    setEditRequestVisible: () => {},
    setRequestDeletePending: () => {},
    setFolderDeletePending: () => {},
    setCollectionSwitcherVisible: () => {},
    setYamlEditor: () => {},
    setView: () => {},
    setFocus: () => {},
    setUndoAllPending: () => {},
    setExpanded: () => {},
    setPreviewIndexProp: () => {},
    setEnvDeletePending: () => {},
    setDeleteConfirmSelection: () => {},
    onReloadCollection: () => {},
  }
}

describe("buildCommandPaletteCommands", () => {
  it("returns all commands with required fields", () => {
    const commands = buildCommandPaletteCommands(minimalContext())
    expect(commands.length).toBe(20)
    for (const cmd of commands) {
      expect(cmd.id).toBeTruthy()
      expect(cmd.label).toBeTruthy()
      expect(cmd.section).toBeTruthy()
      expect(typeof cmd.run).toBe("function")
    }
  })

  it("sections appear in correct order", () => {
    const commands = buildCommandPaletteCommands(minimalContext())
    const sections = [...new Set(commands.map((c) => c.section))]
    expect(sections).toEqual([
      "Request",
      "Response",
      "Environment",
      "Workspace",
      "System",
    ])
  })

  it("each section has contiguous commands", () => {
    const commands = buildCommandPaletteCommands(minimalContext())
    let lastSection = commands[0]!.section
    for (let i = 1; i < commands.length; i++) {
      if (commands[i]!.section !== lastSection) {
        lastSection = commands[i]!.section
      }
    }
    // Verify no section re-appears after switching
    const seen = new Set<string>()
    let prevSection = ""
    for (const cmd of commands) {
      if (cmd.section !== prevSection) {
        expect(seen.has(cmd.section)).toBe(false)
        seen.add(cmd.section)
        prevSection = cmd.section
      }
    }
  })

  it("displays keybinding as ^ shortcut", () => {
    const ctx = minimalContext()
    const custom = { ...ctx.keybinds, request_save: "ctrl+r" }
    ctx.keybinds = custom
    const commands = buildCommandPaletteCommands(ctx)
    const save = commands.find((c) => c.id === "request.save")!
    expect(save.keybinding).toBe("^r")
  })

  it("collection.switcher runs its setter", () => {
    const ctx = minimalContext()
    let opened = false
    ctx.setCollectionSwitcherVisible = () => {
      opened = true
    }
    const commands = buildCommandPaletteCommands(ctx)
    const cmd = commands.find((c) => c.id === "collection.switcher")!
    cmd.run()
    expect(opened).toBe(true)
  })

  it("app.about opens the about overlay", () => {
    const ctx = minimalContext()
    let opened = false
    ctx.setAboutVisible = () => {
      opened = true
    }
    const commands = buildCommandPaletteCommands(ctx)
    const cmd = commands.find((c) => c.id === "app.about")!
    expect(cmd.run()).toBe(true)
    expect(opened).toBe(true)
  })

  it("request.save calls doSave when draft is dirty and not saving", () => {
    const ctx = minimalContext()
    let saved = false
    ctx.draftRef = {
      current: {
        draft: { id: "test" },
        isDirty: true,
        revertAllRequests: () => {},
        dirtyRequestIds: new Set(),
      },
    } as never
    ctx.savingRef = { current: false } as never
    ctx.doSaveRef = {
      current: () => {
        saved = true
      },
    } as never
    const commands = buildCommandPaletteCommands(ctx)
    const save = commands.find((c) => c.id === "request.save")!
    save.run()
    expect(saved).toBe(true)
  })

  it("request.save does not call doSave when draft is not dirty", () => {
    const ctx = minimalContext()
    let saved = false
    ctx.draftRef = {
      current: {
        draft: null,
        isDirty: false,
        revertAllRequests: () => {},
      },
    } as never
    ctx.savingRef = { current: false } as never
    ctx.doSaveRef = {
      current: () => {
        saved = true
      },
    } as never
    const commands = buildCommandPaletteCommands(ctx)
    const save = commands.find((c) => c.id === "request.save")!
    save.run()
    expect(saved).toBe(false)
  })

  it("pane.expand toggles expanded when focus is request", () => {
    const ctx = minimalContext()
    ctx.getKeymapFocus = () => "request"
    let expanded: "request" | "response" | null = null
    ctx.setExpanded = (fn: unknown) => {
      expanded = (
        fn as (
          prev: "request" | "response" | null,
        ) => "request" | "response" | null
      )(null)
    }
    const commands = buildCommandPaletteCommands(ctx)
    const expand = commands.find((c) => c.id === "pane.expand")!
    expand.run()
    expect(expanded!).toBe("request")
  })

  it("pane.expand does nothing when focus is sidebar", () => {
    const ctx = minimalContext()
    ctx.getKeymapFocus = () => "sidebar"
    let called = false
    ctx.setExpanded = () => {
      called = true
    }
    const commands = buildCommandPaletteCommands(ctx)
    const expand = commands.find((c) => c.id === "pane.expand")!
    expand.run()
    expect(called).toBe(false)
  })

  it("edit request YAML uses the full request id path", () => {
    const ctx = minimalContext()
    ctx.selectedIdRef = { current: "users/login" } as never
    ctx.collectionRef = {
      current: {
        id: "collection",
        name: "collection",
        items: [
          {
            type: "folder",
            data: {
              id: "users",
              name: "users",
              path: "users",
              children: [
                {
                  type: "request",
                  data: {
                    id: "users/login",
                    name: "Login",
                    method: "GET",
                    url: "https://example.com",
                    timeout: 0,
                    headers: {},
                    params: [],
                  },
                },
              ],
            },
          },
        ],
      } as Collection,
    } as never

    const file = getEditRequestYamlFile(ctx)
    expect(file?.filePath).toBe("/tmp/collections/users/login.yml")
    expect(file?.requestName).toBe("Login")
  })

  it("collection.reload calls onReloadCollection", () => {
    const ctx = minimalContext()
    let reloaded = false
    ctx.onReloadCollection = () => {
      reloaded = true
    }
    const commands = buildCommandPaletteCommands(ctx)
    const cmd = commands.find((c) => c.id === "collection.reload")!
    const result = cmd.run()
    expect(result).toBe(true)
    expect(reloaded).toBe(true)
  })
})
