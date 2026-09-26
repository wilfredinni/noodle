import { describe, expect, it } from "bun:test"
import { act, useState } from "react"
import { KeymapProvider } from "@opentui/keymap/react"
import type { BoxRenderable, InputRenderable } from "@opentui/core"
import { MouseButtons } from "@opentui/core/testing"
import { createTestRender } from "../testRender"
import { setupKeymap, keyEvent, getHighlightCount } from "./_helpers"
import { ThemeProvider } from "../../src/ui/theme"
import {
  ScriptAuthoringContext,
  ScriptEditor,
  type ActiveScriptSource,
} from "../../src/ui/editor/ScriptEditor"
import { VariableCompletionInterceptor } from "../../src/ui/variable-completion/variableCompletionInterceptor"
import {
  CodeEditorRenderable,
  CodeEditorScrollBarRenderable,
} from "../../src/ui/editor/CodeEditor"

const testRender = createTestRender()

async function mountEditor(
  initial: string,
  width = 90,
  initiallyEditing = true,
) {
  const { keymap, host } = setupKeymap()
  let complete = Promise.withResolvers<void>()
  let value = initial
  let editing = true
  let confirm: (() => void) | undefined
  let active: ActiveScriptSource | null = null
  let opened: ActiveScriptSource | undefined
  let change!: (text: string) => void
  let edit!: (value: boolean) => void
  let focus!: (value: boolean) => void
  const context = {
    collectionDir: "/tmp",
    collection: null,
    confirm: (action: () => void) => {
      confirm = action
    },
    open: (source: ActiveScriptSource) => {
      opened = source
    },
    setActive: (source: ActiveScriptSource | null) => {
      active = source
    },
  }
  function Harness() {
    const [text, setText] = useState(initial)
    const [isEditing, setEditing] = useState(initiallyEditing)
    const [focused, setFocused] = useState(true)
    change = setText
    edit = setEditing
    focus = setFocused
    value = text
    editing = isEditing
    return (
      <ScriptAuthoringContext.Provider value={context}>
        <VariableCompletionInterceptor />
        <ScriptEditor
          value={text}
          phase="pre"
          source={{ scope: "request", scopeId: "a", path: "a.yml" }}
          focused={focused}
          editing={isEditing}
          onChange={setText}
          onActivate={() => setEditing(true)}
          onExit={() => setEditing(false)}
          diagnosticDelayMs={0}
          onDiagnostics={() => complete.resolve()}
        />
      </ScriptAuthoringContext.Provider>
    )
  }
  const render = await testRender(
    <KeymapProvider keymap={keymap}>
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <Harness />
      </ThemeProvider>
    </KeymapProvider>,
    { width, height: 16 },
  )
  const settle = async () => {
    await act(async () => {
      await complete.promise
    })
    await act(async () => {
      await render.renderOnce()
      await render.renderOnce()
    })
  }
  await settle()
  return {
    ...render,
    host,
    keymap,
    value: () => value,
    editing: () => editing,
    active: () => active,
    opened: () => opened,
    confirm: async () => {
      complete = Promise.withResolvers<void>()
      await act(async () => confirm?.())
      await settle()
    },
    pendingConfirmation: () => confirm,
    beginDiagnostics: () => {
      complete = Promise.withResolvers<void>()
    },
    settle,
    replace: async (text: string) => {
      complete = Promise.withResolvers<void>()
      await act(async () => change(text))
      await settle()
    },
    browse: async () => {
      await act(async () => edit(false))
      await act(async () => {
        await render.renderOnce()
        await render.renderOnce()
      })
    },
    focus: async (focused: boolean) => {
      await act(async () => focus(focused))
      await render.renderOnce()
    },
    editor: () =>
      render.renderer.root.findDescendantById(
        "script-source",
      ) as CodeEditorRenderable,
  }
}

describe("ScriptEditor", () => {
  it("keeps syntax colors before editing and after leaving the editor", async () => {
    const source = 'const message = "hello";\nconsole.log(message);'
    const h = await mountEditor(source, 60, false)
    const editor = h.editor()
    await editor.refreshHighlights()
    await h.renderOnce()
    expect(h.captureCharFrame()).toContain('const message = "hello";')
    expect(getHighlightCount(editor)).toBeGreaterThan(0)
    const sourceColors = () =>
      h
        .captureSpans()
        .lines[editor.y]!.spans.filter((span) => span.text.trim())
        .map((span) => ({ text: span.text, fg: span.fg }))
    const colors = sourceColors()
    await act(async () => h.host.press("down"))
    await editor.refreshHighlights()
    expect(editor.focused).toBe(true)
    await h.browse()
    await editor.refreshHighlights()
    await h.focus(false)
    expect(editor.focused).toBe(false)
    expect(getHighlightCount(editor)).toBeGreaterThan(0)
    expect(sourceColors()).toEqual(colors)
    expect(h.value()).toBe(source)
    await h.replace('const changed = "still highlighted";')
    await editor.refreshHighlights()
    await h.renderOnce()
    expect(h.captureCharFrame()).toContain("still highlighted")
    expect(getHighlightCount(editor)).toBeGreaterThan(0)
  })

  it("keeps numbered source and scrolling reachable when blurred and resized", async () => {
    const source = Array.from(
      { length: 40 },
      (_, line) => `console.log("line ${line + 1}");`,
    ).join("\n")
    const h = await mountEditor(source, 60, false)
    const editor = h.editor()
    const gutter = h.renderer.root.findDescendantById("script-line-numbers")!
    const scrollbar = h.renderer.root.findDescendantById(
      "script-scrollbar",
    ) as CodeEditorScrollBarRenderable
    expect(scrollbar).toBeDefined()
    expect(h.captureCharFrame()).toMatch(/1\s+console.log/)
    await h.focus(false)
    await act(async () => {
      h.resize(30, 6)
      await h.renderOnce()
    })
    for (let i = 0; i < 45; i++) {
      await h.mockMouse.scroll(gutter.x + 1, editor.y, "down")
      await h.renderOnce()
    }
    expect(h.captureCharFrame()).toMatch(/40\s+console.log\("line 40"\)/)
    expect(scrollbar.scrollPosition).toBe(editor.scrollY)
    expect(scrollbar.viewportSize).toBe(editor.viewport.height)
    expect(editor.focused).toBe(false)
    expect(h.value()).toBe(source)
    await act(async () => {
      await h.mockMouse.click(editor.x + 2, editor.y, MouseButtons.LEFT)
    })
    // The containing pane owns focus; the editor must not take it while blurred.
    expect(editor.focused).toBe(false)
    await h.focus(true)
    expect(editor.focused).toBe(true)
    expect(h.value()).toBe(source)
  })

  it("shows only actionable diagnostics without status messages on focus changes", async () => {
    const h = await mountEditor('console.log("valid")')
    expect(h.captureCharFrame()).not.toMatch(/Checking syntax|Syntax valid/)
    await h.browse()
    await h.focus(false)
    expect(h.captureCharFrame()).not.toMatch(/Checking syntax|Syntax valid/)
    await h.focus(true)
    expect(h.captureCharFrame()).not.toMatch(/Checking syntax|Syntax valid/)
    await h.replace("const broken = ;")
    expect(h.captureCharFrame()).toContain("SyntaxError at 1:")
    await h.replace('console.log("fixed")')
    expect(h.captureCharFrame()).not.toContain("SyntaxError")
  })

  it("uses shared completion help and consumes completion and multiline keys before request commands", async () => {
    const h = await mountEditor("noodle.run.se")
    await act(async () => {
      h.editor().cursorOffset = h.editor().plainText.length
    })
    await act(async () => {
      await h.renderOnce()
      await h.renderOnce()
    })
    expect(h.captureCharFrame()).toContain("persist")
    let sent = 0
    h.keymap.intercept(
      "key",
      ({ event }) => {
        if (event.ctrl && event.name === "return") {
          sent++
          event.preventDefault()
          event.stopPropagation()
        }
      },
      { priority: 100 },
    )
    await act(async () => h.host.press("return", { ctrl: true }))
    expect(sent).toBe(1)
    expect(h.value()).toBe("noodle.run.se")
    let leaked = 0
    h.keymap.intercept(
      "key",
      () => {
        leaked++
      },
      { priority: 100 },
    )
    h.beginDiagnostics()
    await act(async () => h.host.press("tab"))
    await h.settle()
    expect(h.value()).toBe("noodle.run.set")
    expect(leaked).toBe(0)
    expect(h.editing()).toBe(true)
    h.beginDiagnostics()
    await act(async () => h.host.press("return"))
    await h.settle()
    expect(h.value()).toBe("noodle.run.set\n")
    h.beginDiagnostics()
    await act(async () => h.host.press("tab"))
    await h.settle()
    expect(h.value()).toBe("noodle.run.set\n  ")
    await act(async () => h.host.press("escape"))
    expect(h.editing()).toBe(false)
    expect(leaked).toBe(0)
  })

  it("pairs quotes and brackets, preserves JavaScript comparison operators and reports syntax at narrow widths", async () => {
    const h = await mountEditor("", 40)
    h.beginDiagnostics()
    await act(async () => h.editor().handleKeyPress(keyEvent("(")))
    await h.settle()
    expect(h.value()).toBe("()")
    await h.replace("")
    h.beginDiagnostics()
    await act(async () => h.editor().handleKeyPress(keyEvent('"')))
    await h.settle()
    expect(h.value()).toBe('""')
    await h.replace("a ")
    await act(async () => {
      h.editor().cursorOffset = 2
    })
    h.beginDiagnostics()
    await act(async () => h.editor().handleKeyPress(keyEvent("<")))
    await h.settle()
    expect(h.value()).toBe("a <")
    await h.replace('const message = "hello"\nconst broken = ;')
    expect(h.captureCharFrame()).toContain("SyntaxError at 2:")
    expect(getHighlightCount(h.editor())).toBeGreaterThan(0)
    await h.replace("await unsupportedApi();")
    expect(h.captureCharFrame()).not.toContain("SyntaxError")
  })

  it.each(["missing.js", "./missing.js"])(
    "keeps %s editable and confirms discarded source",
    async (input) => {
      const h = await mountEditor('console.log("keep")')
      await h.browse()
      await act(async () => h.host.press("return"))
      await act(async () => h.host.press("down"))
      await act(async () => h.host.press("return"))
      expect(h.pendingConfirmation()).toBeDefined()
      expect(h.value()).toBe('console.log("keep")')
      expect(h.active()).toBeNull()
      await h.confirm()
      expect(h.value()).toBe("")
      expect(h.captureCharFrame()).toContain("./path/to/file.js")
      const pathInput = h.renderer.root.findDescendantById(
        "script-path",
      ) as InputRenderable
      await act(async () => h.host.press("down"))
      expect(pathInput.focused).toBe(false)
      await act(async () => h.host.press("return"))
      for (const character of input) {
        h.beginDiagnostics()
        await act(async () => pathInput.insertText(character))
        await h.settle()
        expect(
          h.renderer.root.findDescendantById("script-path") === pathInput,
        ).toBe(true)
        expect(pathInput.focused).toBe(true)
      }
      expect(h.value()).toBe("./missing.js")
      h.beginDiagnostics()
      await act(async () => pathInput.handleKeyPress(keyEvent("backspace")))
      await h.settle()
      expect(h.value()).toBe("./missing.j")
      expect(
        h.renderer.root.findDescendantById("script-path") === pathInput,
      ).toBe(true)
      h.beginDiagnostics()
      await act(async () => pathInput.insertText("s"))
      await h.settle()
      await h.browse()
      expect(h.active()?.value).toBe("./missing.js")
      expect(h.captureCharFrame()).toContain("missing, or unreadable")
      await act(async () => h.host.press("tab"))
      await act(async () => h.host.press("return"))
      expect(h.opened()?.value).toBe("./missing.js")
      let leftPane = 0
      h.keymap.intercept(
        "key",
        ({ event }) => {
          if (event.name === "tab") leftPane++
        },
        { priority: 100 },
      )
      await act(async () => h.host.press("tab", { shift: true }))
      expect(leftPane).toBe(0)
      await act(async () => h.host.press("tab"))
      await act(async () => h.host.press("tab"))
      expect(leftPane).toBe(1)
      const path = h.renderer.root.findDescendantById(
        "script-path",
      ) as BoxRenderable
      await act(async () => h.renderOnce())
      await act(async () =>
        h.mockMouse.click(path.x + 1, path.y, MouseButtons.LEFT),
      )
      expect(h.editing()).toBe(true)
      await h.replace('console.info("restored")')
      expect(h.value()).toBe('console.info("restored")')
      expect(h.renderer.root.findDescendantById("script-source")).toBeDefined()
      expect(h.active()).toBeNull()
    },
  )
})
