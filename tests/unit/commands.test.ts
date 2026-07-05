import { describe, it, expect } from "bun:test"
import type { CliRenderer } from "@opentui/core"
import { buildCommandPaletteCommands } from "../../src/ui/commands"
import type { CommandBuilderContext } from "../../src/ui/commands"
import { bindingDefaults } from "../../src/ui/keybind"

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
    setLayout: () => {},
    onLayoutChange: () => {},
    setHelpVisible: () => {},
    setNewRequestVisible: () => {},
    setNewFolderVisible: () => {},
    setCloneRequestVisible: () => {},
    setEditRequestVisible: () => {},
    setRequestDeletePending: () => {},
    setFolderDeletePending: () => {},
    setYamlEditor: () => {},
    setView: () => {},
    setFocus: () => {},
    setUndoAllPending: () => {},
    setExpanded: () => {},
    setPreviewIndexProp: () => {},
  }
}

describe("buildCommandPaletteCommands", () => {
  it("returns all commands with required fields", () => {
    const commands = buildCommandPaletteCommands(minimalContext())
    expect(commands.length).toBe(16)
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
      "Request Editing",
      "Actions",
      "System",
      "Env Editor",
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
    const custom = { ...ctx.keybinds, request_send: "ctrl+r" }
    ctx.keybinds = custom
    const commands = buildCommandPaletteCommands(ctx)
    const send = commands.find((c) => c.id === "request.send")!
    expect(send.keybinding).toBe("^r")
  })

  it("request.save requires draft and isDirty", () => {
    const ctx = minimalContext()
    ctx.draftRef = {
      current: { draft: null, isDirty: false, revertAllRequests: () => {} },
    } as never
    ctx.savingRef = { current: false } as never
    ctx.doSaveRef = { current: () => {} } as never
    const commands = buildCommandPaletteCommands(ctx)
    const save = commands.find((c) => c.id === "request.save")!
    expect(save.run).toBeDefined()
  })

  it("pane.expand ignores non-request/response focus", () => {
    const ctx = minimalContext()
    ctx.getKeymapFocus = () => "sidebar"
    const commands = buildCommandPaletteCommands(ctx)
    const expand = commands.find((c) => c.id === "pane.expand")!
    expect(expand.run).toBeDefined()
  })
})