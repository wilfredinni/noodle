import { describe, it, expect } from "bun:test"
import type { CliRenderer } from "@opentui/core"
import { buildCommandPaletteCommands } from "../../src/ui/commands"
import type { CommandBuilderContext } from "../../src/ui/commands"
import { bindingDefaults } from "../../src/ui/keybind"
import type { Collection } from "../../src/schema"
import {
  closeCollectionExport,
  cloneRequest,
  getEditRequestYamlFile,
  saveFolder,
  saveRequest,
  sendRequest,
  undoAll,
} from "../../src/ui/commandActions"

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
    responseQueryRef: { current: null } as never,
    responseBodyForCopyRef: { current: null } as never,
    activeIndexRef: { current: 0 } as never,
    savingRef: { current: false } as never,
    doSaveRef: { current: () => {} } as never,
    folderSaveRef: { current: () => {} } as never,
    focusedFolderPathRef: { current: null } as never,
    focusedFolderNameRef: { current: null } as never,
    folderDeletePathRef: { current: null } as never,
    getKeymapFocus: () => "sidebar",
    getView: () => "main",
    getCollectionMode: () => "collection",
    setLayout: () => {},
    onLayoutChange: () => true,
    setHelpVisible: () => {},
    setAboutVisible: () => {},
    setNewEnvironmentVisible: () => {},
    setEnvironmentPickerVisible: () => {},
    setNewRequestVisible: () => {},
    setImportCurlVisible: () => {},
    setNewFolderVisible: () => {},
    openSettingsView: () => {},
    setCloneRequestVisible: () => {},
    setEditRequestVisible: () => {},
    setRequestDeletePending: () => {},
    setFolderDeletePending: () => {},
    setCollectionSwitcherVisible: () => {},
    setRequestFinderVisible: () => {},
    setCodeGeneratorVisible: () => {},
    setExportCollectionVisible: () => {},
    setImportCollectionVisible: () => {},
    setYamlEditor: () => {},
    setView: () => {},
    setFocus: () => {},
    setUndoAllPending: () => {},
    setInitPending: () => {},
    setExpanded: () => {},
    setPreviewIndexProp: () => {},
    setEnvDeletePending: () => {},
    onReloadCollection: () => {},
    triggerUpdateCheck: () => {},
    paletteTarget: null,
  }
}

describe("buildCommandPaletteCommands", () => {
  it("keeps collection export open while an export is pending", () => {
    let visible = true
    const setVisible = (value: boolean) => {
      visible = value
    }

    expect(closeCollectionExport({ current: true }, setVisible)).toBe(false)
    expect(visible).toBe(true)
    expect(closeCollectionExport({ current: false }, setVisible)).toBe(true)
    expect(visible).toBe(false)
  })

  it("returns all commands with required fields", () => {
    const commands = buildCommandPaletteCommands(minimalContext())
    expect(commands.length).toBeGreaterThanOrEqual(23)
    for (const cmd of commands) {
      expect(cmd.id).toBeTruthy()
      expect(cmd.label).toBeTruthy()
      expect(cmd.section).toBeTruthy()
      expect(typeof cmd.run).toBe("function")
    }
  })

  it("labels the help command as keyboard shortcuts", () => {
    const command = buildCommandPaletteCommands(minimalContext()).find(
      (item) => item.id === "app.help",
    )

    expect(command?.label).toBe("Keyboard Shortcuts")
  })

  it("labels the cookie jar command as Cookies", () => {
    const ctx = minimalContext()
    const command = buildCommandPaletteCommands(ctx).find(
      (item) => item.id === "cookie-jar.open",
    )

    expect(command?.label).toBe("Cookies")
    expect(command?.keybinding).toBeUndefined()

    ctx.keybinds.cookie_jar_open = "ctrl+shift+c"
    const customized = buildCommandPaletteCommands(ctx).find(
      (item) => item.id === "cookie-jar.open",
    )
    expect(customized?.keybinding).toBe("^shift+c")
  })

  it("sections appear in correct order", () => {
    const commands = buildCommandPaletteCommands(minimalContext())
    const sections = [...new Set(commands.map((c) => c.section))]
    expect(sections).toEqual(["Request", "Environment", "Workspace", "System"])
  })

  it("shows only request commands for a request context menu", () => {
    const ctx = minimalContext()
    ctx.paletteTarget = "request"

    const ids = buildCommandPaletteCommands(ctx).map((command) => command.id)

    expect(ids).toEqual([
      "request.generate-client-code",
      "request.send",
      "request.save",
      "request.edit-overlay",
      "request.clone",
      "request.delete",
      "workspace.edit-yaml",
    ])
  })

  it("shows only folder commands for a folder context menu", () => {
    const ctx = minimalContext()
    ctx.paletteTarget = "folder"

    const commands = buildCommandPaletteCommands(ctx)
    expect(commands.map((command) => command.id)).toEqual([
      "folder.save",
      "request.new",
      "request.import-curl",
      "folder.new",
      "folder.delete",
      "workspace.edit-yaml",
    ])
    expect(commands.every((command) => command.section === "Folder")).toBe(true)
  })

  it("shows only environment commands for an environment context menu", () => {
    const ctx = minimalContext()
    ctx.paletteTarget = "environment"

    const commands = buildCommandPaletteCommands(ctx)

    expect(commands.map((command) => command.id)).toEqual([
      "env.save",
      "env.new",
      "env.clone",
      "env.delete",
    ])
    expect(commands.every((command) => command.section === "Environment")).toBe(
      true,
    )
  })

  it("opens the new environment overlay from the environment editor", () => {
    const ctx = minimalContext()
    ctx.getView = () => "env-editor"
    let opened = false
    ctx.setNewEnvironmentVisible = (value) => {
      opened = value === true
    }

    const command = buildCommandPaletteCommands(ctx).find(
      (item) => item.id === "env.new",
    )

    expect(command?.run()).toBe(true)
    expect(opened).toBe(true)
  })

  it("opens the cURL import overlay from a folder context menu", () => {
    const ctx = minimalContext()
    ctx.paletteTarget = "folder"
    let opened = false
    ctx.setImportCurlVisible = (value) => {
      opened = value === true
    }

    const command = buildCommandPaletteCommands(ctx).find(
      (item) => item.id === "request.import-curl",
    )

    expect(command?.run()).toBe(true)
    expect(opened).toBe(true)
  })

  it("does not include response pane commands", () => {
    const ids = buildCommandPaletteCommands(minimalContext()).map(
      (command) => command.id,
    )

    expect(ids).not.toContain("response.query")
    expect(ids).not.toContain("response.copy-body")
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

  it("request.find runs its setter", () => {
    const ctx = minimalContext()
    let opened = false
    ctx.setRequestFinderVisible = () => {
      opened = true
    }
    const commands = buildCommandPaletteCommands(ctx)
    const cmd = commands.find((c) => c.id === "request.find")!
    expect(cmd.keybinding).toBe("^f")
    expect(cmd.run()).toBe(true)
    expect(opened).toBe(true)
  })

  it("opens the cURL import overlay in collection mode", () => {
    const ctx = minimalContext()
    let opened = false
    ctx.setImportCurlVisible = (value) => {
      opened = value === true
    }
    const command = buildCommandPaletteCommands(ctx).find(
      (item) => item.id === "request.import-curl",
    )
    expect(command?.run()).toBe(true)
    expect(opened).toBe(true)
  })

  it("opens collection export only from the full collection palette", () => {
    const ctx = minimalContext()
    let opened = false
    ctx.setExportCollectionVisible = (value) => {
      opened = value === true
    }

    const command = buildCommandPaletteCommands(ctx).find(
      (item) => item.id === "collection.export",
    )
    expect(command?.run()).toBe(true)
    expect(opened).toBe(true)

    ctx.getView = () => "env-editor"
    expect(
      buildCommandPaletteCommands(ctx).some(
        (item) => item.id === "collection.export",
      ),
    ).toBe(true)

    ctx.getCollectionMode = () => "browse"
    expect(
      buildCommandPaletteCommands(ctx).some(
        (item) => item.id === "collection.export",
      ),
    ).toBe(false)

    ctx.getCollectionMode = () => "collection"
    ctx.paletteTarget = "request"
    expect(
      buildCommandPaletteCommands(ctx).some(
        (item) => item.id === "collection.export",
      ),
    ).toBe(false)
  })

  it("opens collection import only from the full collection palette", () => {
    const ctx = minimalContext()
    let opened = false
    ctx.setImportCollectionVisible = (value) => {
      opened = value === true
    }

    const command = buildCommandPaletteCommands(ctx).find(
      (item) => item.id === "collection.import",
    )
    expect(command?.run()).toBe(true)
    expect(opened).toBe(true)

    ctx.getCollectionMode = () => "browse"
    expect(
      buildCommandPaletteCommands(ctx).some(
        (item) => item.id === "collection.import",
      ),
    ).toBe(false)

    ctx.getCollectionMode = () => "collection"
    ctx.paletteTarget = "folder"
    expect(
      buildCommandPaletteCommands(ctx).some(
        (item) => item.id === "collection.import",
      ),
    ).toBe(false)
  })

  it("opens the edit request overlay for the selected request", () => {
    const ctx = minimalContext()
    let opened = false
    ctx.selectedIdRef = { current: "users" } as never
    ctx.collectionRef = {
      current: {
        id: "collection",
        name: "collection",
        items: [
          {
            type: "request",
            data: {
              id: "users",
              name: "Users",
              method: "GET",
              url: "https://example.com/users",
              timeout: 0,
              headers: {},
              params: [],
            },
          },
        ],
      },
    } as never
    ctx.setEditRequestVisible = (value) => {
      opened = value === true
    }

    const command = buildCommandPaletteCommands(ctx).find(
      (item) => item.id === "request.edit-overlay",
    )

    expect(command?.run()).toBe(true)
    expect(opened).toBe(true)
  })

  it("opens the environment editor with the sidebar focused", () => {
    const ctx = minimalContext()
    let opened = ""
    let view = ""
    let focus = ""
    ctx.envStateRef = {
      current: { activeEnv: { name: "development" } },
    } as never
    ctx.envEditorRef = {
      current: { openEditor: (name: string) => (opened = name) },
    } as never
    ctx.setView = (value) => {
      if (typeof value === "string") view = value
    }
    ctx.setFocus = (value) => {
      if (typeof value === "string") focus = value
    }

    const command = buildCommandPaletteCommands(ctx).find(
      (item) => item.id === "env.editor-open",
    )!
    expect(command.keybinding).toBe("f3")
    expect(command.run()).toBe(true)
    expect(opened).toBe("development")
    expect(view).toBe("env-editor")
    expect(focus).toBe("env-sidebar")
  })

  it("opens the environment picker from the command palette", () => {
    const ctx = minimalContext()
    let visible = false
    ctx.setEnvironmentPickerVisible = (value) => {
      visible = value === true
    }

    const command = buildCommandPaletteCommands(ctx).find(
      (item) => item.id === "env.picker-open",
    )!

    expect(command.keybinding).toBe("e")
    expect(command.run()).toBe(true)
    expect(visible).toBe(true)
  })

  it("exposes Open Settings without a duplicate proxy shortcut", () => {
    const ctx = minimalContext()
    const opened: Array<[string | undefined, string | undefined]> = []
    ctx.openSettingsView = (scope, category) => {
      opened.push([scope, category])
    }

    const commands = buildCommandPaletteCommands(ctx)
    const settings = commands.find((item) => item.id === "app.settings-open")!

    expect(settings.keybinding).toBe("f4")
    expect(settings.run()).toBe(true)
    expect(commands.find((item) => item.id === "app.proxy-settings")).toBe(
      undefined,
    )
    expect(opened).toEqual([[undefined, undefined]])
  })

  it("blocks Settings from a dirty environment editor", () => {
    const ctx = minimalContext()
    let opened = false
    ctx.getView = () => "env-editor"
    ctx.envEditorRef = { current: { dirty: true } } as never
    ctx.openSettingsView = () => {
      opened = true
    }

    const settings = buildCommandPaletteCommands(ctx).find(
      (item) => item.id === "app.settings-open",
    )!
    expect(settings.run()).toBe(false)
    expect(opened).toBe(false)
  })

  it("opens client code generation for the current request draft", () => {
    const ctx = minimalContext()
    let visible = false
    ctx.setCodeGeneratorVisible = (value) => {
      visible = value === true
    }
    ctx.draftRef = {
      current: {
        draft: {
          id: "users",
          name: "Users",
          method: "GET",
          url: "https://example.com/users",
          timeout: 0,
          headers: {},
          params: [],
        },
      },
    } as never

    const command = buildCommandPaletteCommands(ctx).find(
      (item) => item.id === "request.generate-client-code",
    )
    expect(command?.run()).toBe(true)
    expect(visible).toBe(true)
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

  it("undoes a dirty request that is not selected", () => {
    const ctx = minimalContext()
    let requestsReverted = false
    ctx.draftRef = {
      current: {
        isDirty: false,
        dirtyRequestIds: new Set(["other-request"]),
        revertAllRequests: () => {
          requestsReverted = true
        },
      },
    } as never
    ctx.folderDraftRef = {
      current: {
        isDirty: false,
        dirtyPaths: new Set(),
        revertAllFolders: () => {},
      },
    } as never
    ctx.envEditorRef = {
      current: { dirty: false, revertDraft: () => {} },
    } as never

    expect(undoAll(ctx)).toBe(true)
    expect(requestsReverted).toBe(true)
  })

  it("folder.save only runs for a dirty folder when no save is pending", () => {
    const ctx = minimalContext()
    let saved = 0
    ctx.focusedFolderPathRef = { current: "api" } as never
    ctx.folderDraftRef = {
      current: { folderDraft: { path: "api" }, isDirty: false },
    } as never
    ctx.folderSaveRef = { current: () => saved++ } as never

    expect(saveFolder(ctx)).toBe(false)
    expect(saved).toBe(0)

    ctx.folderDraftRef = {
      current: { folderDraft: { path: "api" }, isDirty: true },
    } as never
    ctx.savingRef = { current: true } as never
    expect(saveFolder(ctx)).toBe(false)

    ctx.savingRef = { current: false } as never
    expect(saveFolder(ctx)).toBe(true)
    expect(saved).toBe(1)
  })

  it("does not run request actions while a folder is focused", () => {
    const ctx = minimalContext()
    let sent = false
    ctx.focusedFolderPathRef = { current: "api" } as never
    ctx.trySendRef = {
      current: () => {
        sent = true
      },
    } as never

    expect(sendRequest(ctx)).toBe(false)
    expect(saveRequest(ctx)).toBe(false)
    expect(cloneRequest(ctx)).toBe(false)
    expect(sent).toBe(false)
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

  it("excludes Environment section when collection mode is empty", () => {
    const ctx = minimalContext()
    ctx.getCollectionMode = () => "empty"
    const commands = buildCommandPaletteCommands(ctx)
    const sections = [...new Set(commands.map((c) => c.section))]
    expect(sections).not.toContain("Environment")
    expect(sections).toEqual(["Collection", "Workspace", "System"])
  })

  it("excludes environment commands when mode is empty", () => {
    const ctx = minimalContext()
    ctx.getCollectionMode = () => "empty"
    const commands = buildCommandPaletteCommands(ctx)
    const envCmds = commands.filter((c) => c.id.startsWith("env."))
    expect(envCmds).toHaveLength(0)
  })

  it("env editor view shows env commands only in collection mode", () => {
    const ctx = minimalContext()
    ctx.getCollectionMode = () => "collection"
    ctx.getView = () => "env-editor"
    const commands = buildCommandPaletteCommands(ctx)
    const sections = [...new Set(commands.map((c) => c.section))]
    expect(sections).toContain("Environment")
  })

  it("app.check-updates triggers update check", () => {
    const ctx = minimalContext()
    let started = false
    ctx.triggerUpdateCheck = () => {
      started = true
    }
    const commands = buildCommandPaletteCommands(ctx)
    const cmd = commands.find((c) => c.id === "app.check-updates")!
    expect(cmd.label).toBe("Update Noodle")
    expect(cmd.run()).toBe(true)
    expect(started).toBe(true)
  })

  it("env editor view excludes env commands when mode is empty", () => {
    const ctx = minimalContext()
    ctx.getCollectionMode = () => "empty"
    ctx.getView = () => "env-editor"
    const commands = buildCommandPaletteCommands(ctx)
    const sections = [...new Set(commands.map((c) => c.section))]
    expect(sections).not.toContain("Environment")
  })
})
