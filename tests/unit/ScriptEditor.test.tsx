import { afterEach, describe, expect, it } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { scheduler } from "node:timers/promises"
import { act, useState } from "react"
import { KeymapProvider } from "@opentui/keymap/react"
import type { BoxRenderable, InputRenderable } from "@opentui/core"
import { MouseButtons } from "@opentui/core/testing"
import { parseKeypress } from "@opentui/core"
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

import type { ScriptPhase, ScriptSource } from "../../src/preRequestScript"
import { createScriptDiagnostics } from "../../src/ui/editor/scriptDiagnostics"
import type { ScriptCompletionContext } from "../../src/ui/editor/scriptCompletion"
import type { ScriptDiagnostics } from "../../src/ui/editor/scriptSemanticChecker"

const testRender = createTestRender()
const services: ReturnType<typeof createScriptDiagnostics>[] = []
afterEach(() => {
  for (const service of services.splice(0)) service.dispose()
})
const noAssistance = {
  format: async () => [],
  assist: async () => ({ items: [], query: "" }),
  details: async () => ({}),
  retain: () => () => {},
}

async function mountEditor(
  initial: string,
  width = 90,
  initiallyEditing = true,
  source: ScriptSource = { scope: "request", scopeId: "a", path: "a.yml" },
  options: {
    phase?: ScriptPhase
    collectionDir?: string
    completionContext?: ScriptCompletionContext
    shortcut?: string
    diagnostics?: ReturnType<typeof createScriptDiagnostics>
  } = {},
) {
  const { keymap, host } = setupKeymap()
  const service = options.diagnostics ?? createScriptDiagnostics()
  services.push(service)
  const pending = new Set<Promise<unknown>>()
  function track<T>(promise: Promise<T>): Promise<T> {
    pending.add(promise)
    void promise.then(
      () => pending.delete(promise),
      () => pending.delete(promise),
    )
    return promise
  }
  const diagnostics = {
    ...service,
    assist: (...args: Parameters<typeof service.assist>) =>
      track(service.assist(...args)),
    details: (...args: Parameters<typeof service.details>) =>
      track(service.details(...args)),
  }
  const settleAssistance = async () => {
    do {
      await act(async () => {
        await Promise.allSettled([...pending])
      })
      await act(async () => {
        await render.renderOnce()
      })
    } while (pending.size)
  }
  let complete = Promise.withResolvers<void>()
  let value = initial
  let editing = true
  let confirm: (() => void) | undefined
  let active: ActiveScriptSource | null = null
  const opened: ActiveScriptSource[] = []
  let change!: (text: string) => void
  let edit!: (value: boolean) => void
  let focus!: (value: boolean) => void
  let changeNames!: (value: ScriptCompletionContext) => void
  let changePhase!: (value: ScriptPhase) => void
  const context = {
    collectionDir: options.collectionDir ?? "/tmp",
    diagnostics,
    collection: null,
    confirm: (action: () => void) => {
      confirm = action
    },
    setActive: (source: ActiveScriptSource | null) => {
      active = source
    },
    open: (source: ActiveScriptSource) => {
      opened.push(source)
    },
  }
  function Harness() {
    const [names, setNames] = useState(options.completionContext)
    changeNames = setNames
    const [text, setText] = useState(initial)
    const [isEditing, setEditing] = useState(initiallyEditing)
    const [focused, setFocused] = useState(true)
    const [phase, setPhase] = useState<ScriptPhase>(options.phase ?? "pre")
    changePhase = setPhase
    change = setText
    edit = setEditing
    focus = setFocused
    value = text
    editing = isEditing
    return (
      <ScriptAuthoringContext.Provider
        value={{
          ...context,
          completionContext: names,
          completionShortcut: options.shortcut,
        }}
      >
        <VariableCompletionInterceptor />
        <ScriptEditor
          value={text}
          phase={phase}
          source={source}
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
    await settleAssistance()
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
    opened,
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
    settleAssistance,
    names: async (names: ScriptCompletionContext) => {
      await act(async () => changeNames(names))
      await settleAssistance()
    },
    replace: async (text: string) => {
      complete = Promise.withResolvers<void>()
      await act(async () => change(text))
      await settle()
    },
    startReplace: async (text: string) => {
      complete = Promise.withResolvers<void>()
      await act(async () => change(text))
    },
    phase: async (next: ScriptPhase) => {
      complete = Promise.withResolvers<void>()
      await act(async () => changePhase(next))
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
  it.each(["pre", "post", "tests"] as const)(
    "completes collection-relative %s files with the shared path menu",
    async (phase) => {
      const dir = await mkdtemp(join(tmpdir(), "noodle-script-path-"))
      try {
        await mkdir(join(dir, "scripts"))
        await writeFile(join(dir, "scripts", "check.js"), "")
        await writeFile(join(dir, "scripts", "ignore.ts"), "")
        const h = await mountEditor("./scripts/../", 60, true, undefined, {
          phase,
          collectionDir: dir,
        })
        const waitForMenu = async (text: string) => {
          const deadline = Date.now() + 2000
          while (true) {
            await act(async () => {
              await scheduler.yield()
              await h.renderOnce()
            })
            const menu = h.renderer.root.findDescendantById(
              "path-completion-menu",
            )
            if (menu && h.captureCharFrame().includes(text)) return menu
            if (Date.now() >= deadline)
              throw new Error(`Path menu unavailable: ${h.captureCharFrame()}`)
          }
        }
        await waitForMenu("scripts/")
        h.beginDiagnostics()
        await h.focus(false)
        await h.settle()
        expect(
          h.renderer.root.findDescendantById("path-completion-menu"),
        ).toBeUndefined()
        h.beginDiagnostics()
        await h.focus(true)
        await h.settle()
        await waitForMenu("scripts/")
        h.beginDiagnostics()
        await act(async () => h.host.press("tab"))
        await h.settle()
        expect(h.value()).toBe("./scripts/")
        expect(h.editing()).toBe(true)
        await waitForMenu("check.js")
        expect(h.captureCharFrame()).not.toContain("ignore.ts")
        await act(async () => {
          h.resize(30, 10)
          await h.renderOnce()
        })
        const menu = await waitForMenu("check.js")
        expect(menu.x + menu.width).toBeLessThanOrEqual(30)
        expect(menu.y + menu.height).toBeLessThanOrEqual(10)
        h.beginDiagnostics()
        await act(async () => {
          if (phase === "tests") {
            const item = h.renderer.root.findDescendantById(
              "path-completion-menu-item-0",
            )!
            await h.mockMouse.click(item.x, item.y)
          } else h.host.press(phase === "pre" ? "tab" : "return")
        })
        await h.settle()
        expect(h.value()).toBe("./scripts/check.js")
        expect(h.editing()).toBe(true)
        expect(
          h.renderer.root.findDescendantById("path-completion-menu"),
        ).toBeUndefined()
        await act(async () => h.host.press("escape"))
        expect(h.editing()).toBe(false)
      } finally {
        await rm(dir, { recursive: true, force: true })
      }
    },
  )

  it("completes the source after a folded block without replacing hidden code", async () => {
    const source = 'if (true) {\n  console.log("😀 keep");\n}\nJSON.pa'
    const h = await mountEditor(source)
    const editor = h.editor()
    await act(async () => {
      await editor.refreshHighlights()
      editor.toggleFold(0)
      editor.editBuffer.setCursor(1, 7)
      h.host.press("space", { ctrl: true })
    })
    await h.settleAssistance()
    expect(h.captureCharFrame()).toContain("parse")
    h.beginDiagnostics()
    await act(async () => h.host.press("tab"))
    await h.settle()
    expect(h.value()).toBe(source.replace("JSON.pa", "JSON.parse"))
    h.beginDiagnostics()
    await act(async () => editor.handleKeyPress(keyEvent("z", { ctrl: true })))
    await h.settle()
    expect(h.value()).toBe(source)
  })

  it.each(["pre", "post", "tests"] as const)(
    "folds %s scripts with the gutter and keyboard while preserving source",
    async (phase) => {
      const source = [
        'test("response", () => {',
        '  console.log("inside");',
        "});",
        'console.log("after");',
      ].join("\n")
      const h = await mountEditor(source, 60, false, undefined, {
        phase,
        diagnostics: {
          ...createScriptDiagnostics(),
          ...noAssistance,
          check: async () => ({ count: 0 }),
        },
      })
      const editor = h.editor()
      const gutter = h.renderer.root.findDescendantById("script-line-numbers")!
      await act(async () => {
        await editor.refreshHighlights()
        await h.renderOnce()
      })
      expect(h.captureCharFrame()).toMatch(/▼\s+1\s+test/)
      await act(async () => {
        await h.mockMouse.click(gutter.x, editor.y)
        await editor.refreshHighlights()
        await h.renderOnce()
      })
      expect(h.captureCharFrame()).toMatch(/▶\s+1\s+test/)
      expect(h.captureCharFrame()).not.toContain('console.log("inside")')
      expect(h.captureCharFrame()).toMatch(/4\s+console.log\("after"\)/)
      expect(h.editing()).toBe(false)
      expect(h.value()).toBe(source)
      expect(editor.plainText).toBe(source)
      await act(async () => {
        editor.editorView.setSelection(0, editor.editBuffer.getText().length)
      })
      expect(editor.getSelectedText()).toBe(source)
      editor.clearSelection()
      await act(async () => {
        h.resize(32, 10)
        await h.renderOnce()
      })
      expect(h.captureCharFrame()).toMatch(/4\s+console.log\("after"\)/)
      await act(async () => h.host.press("down"))
      await act(async () => {
        editor.editBuffer.setCursor(0, 0)
        editor.handleKeyPress(keyEvent("g", { ctrl: true }))
        await editor.refreshHighlights()
        await h.renderOnce()
      })
      expect(h.captureCharFrame()).toContain('console.log("inside")')
      expect(h.value()).toBe(source)
    },
  )

  it("keeps the scrolled source viewport when accepting a completion", async () => {
    const source = Array.from({ length: 80 }, (_, row) =>
      row === 40 ? "JSON.pa" : `// line ${row + 1}`,
    ).join("\n")
    const service = createScriptDiagnostics()
    const h = await mountEditor(source, 70, true, undefined, {
      diagnostics: { ...service, check: async () => ({ count: 0 }) },
    })
    await act(async () => {
      h.editor().editBuffer.setCursor(40, 7)
      h.editor().scrollTo(36)
      await h.renderOnce()
    })
    const before = h.editor().viewport.offsetY
    await act(async () => h.host.press("space", { ctrl: true }))
    await h.settleAssistance()
    expect(h.editor().viewport.offsetY).toBe(before)
    h.beginDiagnostics()
    await act(async () => h.host.press("tab"))
    await h.settle()
    expect(h.value().split("\n")[40]).toBe("JSON.parse")
    expect(h.editor().viewport.offsetY).toBe(before)
  })

  it("keeps the popup mounted and sized while assistance and details refresh", async () => {
    let respond!: (result: {
      items: {
        key: string
        label: string
        insert: string
        start: number
        end: number
      }[]
      query: string
    }) => void
    let describe!: (result: { description: string; signature: string }) => void
    const h = await mountEditor("JSON.p", 70, true, undefined, {
      diagnostics: {
        ...noAssistance,
        check: async () => ({ count: 0 }),
        assist: (_source, _phase, _cursor, _context, _explicit, signal) =>
          new Promise((resolve) => {
            respond = resolve
            signal?.addEventListener(
              "abort",
              () => resolve({ items: [], query: "" }),
              { once: true },
            )
          }),
        details: (_source, _phase, _cursor, _key, signal) =>
          new Promise((resolve) => {
            describe = resolve
            signal?.addEventListener("abort", () => resolve({}), { once: true })
          }),
        dispose() {},
      },
    })
    await act(async () => {
      h.editor().cursorOffset = h.value().length
      h.host.press("space", { ctrl: true })
    })
    await act(async () => {
      respond({
        items: [
          { key: "parse", label: "parse", insert: "parse", start: 5, end: 6 },
        ],
        query: "p",
      })
    })
    await act(async () => h.renderOnce())
    const popup = h.renderer.root.findDescendantById("script-completion-menu")!
    const geometry = {
      x: popup.x,
      y: popup.y,
      width: popup.width,
      height: popup.height,
    }
    await act(async () =>
      describe({
        description: "Parses JSON.",
        signature: "parse(text: string): any",
      }),
    )
    await h.settleAssistance()
    expect({
      x: popup.x,
      y: popup.y,
      width: popup.width,
      height: popup.height,
    }).toEqual(geometry)
    h.beginDiagnostics()
    await act(async () => {
      await h.mockInput.typeText("a")
      await h.renderOnce()
    })
    expect(
      h.renderer.root.findDescendantById("script-completion-menu")?.num,
    ).toBe(popup.num)
    await act(async () => h.host.press("tab"))
    expect(h.value()).toBe("JSON.pa")
    expect(h.editing()).toBe(true)
    await act(async () =>
      respond({
        items: [
          { key: "parse", label: "parse", insert: "parse", start: 5, end: 7 },
        ],
        query: "pa",
      }),
    )
    await act(async () =>
      describe({
        description: "Parses JSON.",
        signature: "parse(text: string): any",
      }),
    )
    await h.settle()
    expect(
      h.renderer.root.findDescendantById("script-completion-menu")?.num,
    ).toBe(popup.num)
    const keys: string[] = []
    const release = h.keymap.intercept(
      "key",
      ({ event }) => {
        keys.push(event.name)
      },
      { priority: 0 },
    )
    h.beginDiagnostics()
    await act(async () => h.mockInput.typeText("r"))
    await act(async () => {
      h.host.press("up")
      h.host.press("down")
    })
    expect(keys).toContain("up")
    expect(keys).toContain("down")
    await act(async () => h.host.press("return"))
    expect(h.value()).toBe("JSON.par\n")
    await act(async () => respond({ items: [], query: "" }))
    await h.settle()
    release()
  })

  it("does not reuse completion details from a different source snapshot", async () => {
    const nextDetails = Promise.withResolvers<{ description: string }>()
    const h = await mountEditor("first.g", 70, true, undefined, {
      diagnostics: {
        ...noAssistance,
        check: async () => ({ count: 0 }),
        assist: async () => ({
          items: [
            { key: "get", label: "get", insert: "get", start: 6, end: 7 },
          ],
          query: "g",
        }),
        details: async (text) =>
          text === "first.g"
            ? { description: "First object documentation" }
            : nextDetails.promise,
        dispose() {},
      },
    })
    await act(async () => {
      h.editor().cursorOffset = h.value().length
      h.host.press("space", { ctrl: true })
    })
    await h.settleAssistance()
    expect(h.captureCharFrame()).toContain("First object documentation")
    try {
      await h.startReplace("second.g")
      await act(async () => h.renderOnce())
      expect(h.captureCharFrame()).not.toContain("First object documentation")
    } finally {
      nextDetails.resolve({ description: "Second object documentation" })
      await h.settle()
    }
    expect(h.captureCharFrame()).toContain("Second object documentation")
  })

  it("reserves one row for a detail-only syntax error", async () => {
    const h = await mountEditor("const =", 70, true, undefined, {
      diagnostics: {
        ...noAssistance,
        check: async () => ({ count: 0 }),
        dispose() {},
      },
    })
    expect(h.captureCharFrame()).toContain("SyntaxError")
    const before = h.editor().height
    await h.replace("const value = 1")
    expect(h.editor().height).toBe(before + 1)
  })

  it("keeps diagnostic space stable during refresh and reclaims it after correction", async () => {
    let finish!: (result: ScriptDiagnostics) => void
    const source = Array.from({ length: 80 }, (_, row) =>
      row === 40 ? "JSON.p" : `// line ${row + 1}`,
    ).join("\n")
    const h = await mountEditor(source, 70, true, undefined, {
      diagnostics: {
        ...noAssistance,
        check: async (text) =>
          text === source
            ? {
                count: 1,
                first: {
                  code: 1,
                  line: 1,
                  column: 6,
                  message: "Unknown member",
                },
              }
            : new Promise((resolve) => {
                finish = resolve
              }),
        dispose() {},
      },
    })
    await act(async () => {
      h.editor().editBuffer.setCursor(40, 6)
      h.editor().scrollTo(36)
      await h.renderOnce()
    })
    const before = h.editor().height
    const offset = h.editor().viewport.offsetY
    h.beginDiagnostics()
    await act(async () => h.mockInput.typeText("a"))
    await act(async () => h.renderOnce())
    expect(h.editor().height).toBe(before)
    expect(h.editor().viewport.offsetY).toBe(offset)
    await h.waitFor(() => !!finish)
    await act(async () =>
      finish({
        count: 1,
        first: { code: 1, line: 1, column: 6, message: "Unknown member" },
      }),
    )
    await h.settle()
    expect(h.editor().height).toBe(before)
    expect(h.editor().viewport.offsetY).toBe(offset)
    const previous = finish
    h.beginDiagnostics()
    await act(async () => h.mockInput.typeText("rse"))
    await h.waitFor(() => finish !== previous)
    await act(async () => finish({ count: 0 }))
    await h.settle()
    expect(h.editor().height).toBe(before + 2)
    expect(h.editor().viewport.offsetY).toBe(offset)
  })

  it.each(["request", "folder", "collection"] as const)(
    "completes JavaScript in the %s editor, accepts one undoable edit, and supports raw Ctrl+Space",
    async (scope) => {
      expect(parseKeypress("\x00")).toMatchObject({ name: "space", ctrl: true })
      const source = 'const token = "hello"; token.toU'
      const h = await mountEditor(source, 70, true, {
        scope,
        path: "sample.yml",
      })
      await act(async () => {
        h.editor().cursorOffset = source.length
        h.host.press("space", { ctrl: true })
      })
      await h.settleAssistance()
      expect(h.captureCharFrame()).toContain("toUpperCase")
      h.beginDiagnostics()
      await act(async () => h.host.press("tab"))
      await h.settle()
      expect(h.value()).toBe('const token = "hello"; token.toUpperCase')
      h.beginDiagnostics()
      await act(async () =>
        h.editor().handleKeyPress(keyEvent("z", { ctrl: true })),
      )
      await h.settle()
      expect(h.value()).toBe(source)
    },
  )

  it("shows noninteractive parameter hints, preserves multiline keys, and dismisses before leaving edit mode", async () => {
    const source = 'noodle.run.set("key", 12)'
    const h = await mountEditor(source, 90)
    await act(async () => {
      h.editor().cursorOffset = source.length - 1
    })
    h.beginDiagnostics()
    await act(async () => h.mockInput.typeText("3"))
    await h.settle()
    expect(h.captureCharFrame()).toContain("value: NoodleScript.JsonValue")
    const signature = h.renderer.root.findDescendantById(
      "script-completion-menu-signature",
    )
    expect(signature).toBeDefined()
    const before = h.editor().cursorOffset
    await act(async () => h.editor().handleKeyPress(keyEvent("left")))
    await h.settleAssistance()
    expect(h.editor().cursorOffset).toBe(before - 1)
    await act(async () => h.host.press("escape"))
    expect(h.editing()).toBe(true)
    expect(
      h.renderer.root.findDescendantById("script-completion-menu"),
    ).toBeUndefined()
    await act(async () => h.host.press("escape"))
    expect(h.editing()).toBe(false)
  })

  it("refreshes collection names, honors shortcut overrides, and hides suggestions on phase changes", async () => {
    const source = 'noodle.env.get("")'
    const h = await mountEditor(source, 42, true, undefined, {
      shortcut: "ctrl+alt+a",
      completionContext: {
        environmentKeys: ["TOKEN"],
        requestIds: ["auth/login"],
      },
    })
    await act(async () => {
      h.editor().cursorOffset = source.length - 2
      h.host.press("space", { ctrl: true })
    })
    expect(
      h.renderer.root.findDescendantById("script-completion-menu"),
    ).toBeUndefined()
    await act(async () => h.host.press("a", { ctrl: true, meta: true }))
    await h.settleAssistance()
    expect(h.captureCharFrame()).toContain("TOKEN")
    await h.names({ environmentKeys: ["NEW_KEY"], requestIds: ["users/list"] })
    expect(h.captureCharFrame()).toContain("NEW_KEY")
    expect(h.captureCharFrame()).not.toContain("TOKEN")
    h.beginDiagnostics()
    await act(async () => h.host.press("tab"))
    await h.settle()
    expect(h.value()).toBe('noodle.env.get("NEW_KEY")')
    await h.phase("post")
    expect(
      h.renderer.root.findDescendantById("script-completion-menu"),
    ).toBeUndefined()
  })

  it("completes after Unicode and multiline source without corrupting the prefix", async () => {
    const source = "// 😀 café\nJSON.pa"
    const h = await mountEditor(source)
    await act(async () => {
      h.editor().editBuffer.setCursor(1, 7)
      h.host.press("space", { ctrl: true })
    })
    await h.settleAssistance()
    expect(h.captureCharFrame()).toContain("parse")
    h.beginDiagnostics()
    await act(async () => h.host.press("tab"))
    await h.settle()
    expect(h.value()).toBe("// 😀 café\nJSON.parse")
  })

  it("keeps the active parameter visible in a narrow editor", async () => {
    const source = 'noodle.run.set("key", 12, {})'
    const h = await mountEditor(source, 30)
    await act(async () => {
      h.editor().cursorOffset = source.length - 2
      h.host.press("space", { ctrl: true })
    })
    await h.settleAssistance()
    expect(h.captureCharFrame()).toContain("options?")
    const popup = h.renderer.root.findDescendantById("script-completion-menu")!
    expect(popup.x + popup.width).toBeLessThanOrEqual(30)
  })

  it("preserves typing with a printable completion shortcut override", async () => {
    const h = await mountEditor("JSON.", 70, true, undefined, { shortcut: "x" })
    await act(async () => {
      h.editor().cursorOffset = h.value().length
      h.host.press("x")
    })
    await h.settleAssistance()
    expect(
      h.renderer.root.findDescendantById("script-completion-menu"),
    ).toBeUndefined()
    h.beginDiagnostics()
    await act(async () => h.editor().handleKeyPress(keyEvent("x")))
    await h.settle()
    expect(h.value()).toBe("JSON.x")
  })

  it("falls back to Noodle API completion when the worker fails", async () => {
    const h = await mountEditor("noodle.run.s", 70, true, undefined, {
      diagnostics: {
        ...noAssistance,
        check: async () => ({ count: 0 }),
        assist: async () => {
          throw new Error("worker unavailable")
        },
        dispose() {},
      },
    })
    await act(async () => {
      h.editor().cursorOffset = h.value().length
      h.host.press("space", { ctrl: true })
    })
    await h.settleAssistance()
    expect(h.captureCharFrame()).toContain("set(name: string")
    h.beginDiagnostics()
    await act(async () => h.host.press("tab"))
    await h.settle()
    expect(h.value()).toBe("noodle.run.set")
  })

  it("shows compact advisory diagnostics and removes them after correction", async () => {
    const h = await mountEditor("missing; another", 40)
    expect(h.captureCharFrame()).toContain("JavaScript at 1:1 (+1 more)")
    expect(h.editor().focused).toBe(true)
    await h.replace('console.log("valid")')
    expect(h.captureCharFrame()).not.toContain("JavaScript at")
    await h.replace("const broken = ;")
    expect(h.captureCharFrame()).toContain("SyntaxError")
    expect(h.captureCharFrame()).not.toContain("JavaScript at")
  })

  it("rechecks the same text when the script phase changes", async () => {
    const h = await mountEditor("noodle.response.status")
    expect(h.captureCharFrame()).toContain("JavaScript at")
    await h.phase("post")
    expect(h.captureCharFrame()).not.toContain("JavaScript at")
    await h.replace('noodle.request.url = "https://example.com"')
    expect(h.captureCharFrame()).toContain("read-only")
    await h.phase("pre")
    expect(h.captureCharFrame()).not.toContain("JavaScript at")
  })

  it("discards old semantic replies after a newer edit and preserves syntax errors", async () => {
    const requests: {
      resolve: (result: ScriptDiagnostics) => void
      signal?: AbortSignal
    }[] = []
    const diagnostics = {
      ...noAssistance,
      check: (source: string, _phase: ScriptPhase, signal?: AbortSignal) =>
        source.includes('"initial"')
          ? Promise.resolve({ count: 0 })
          : new Promise<ScriptDiagnostics>((resolve) =>
              requests.push({ resolve, signal }),
            ),
      dispose() {},
    }
    const h = await mountEditor('console.log("initial")', 90, true, undefined, {
      diagnostics,
    })
    await h.startReplace("oldValue")
    await h.waitFor(() => requests.length === 1)
    await h.startReplace("newValue")
    await h.waitFor(() => requests.length === 2)
    expect(requests[0]!.signal?.aborted).toBe(true)
    await act(async () => requests[1]!.resolve({ count: 0 }))
    await h.settle()
    await act(async () =>
      requests[0]!.resolve({
        count: 1,
        first: { code: 1, message: "stale diagnostic", line: 1, column: 1 },
      }),
    )
    expect(h.captureCharFrame()).not.toContain("stale diagnostic")
    await h.startReplace("anotherValue")
    await h.waitFor(() => requests.length === 3)
    await h.replace("const broken = ;")
    await act(async () => requests[2]!.resolve({ count: 0 }))
    expect(h.captureCharFrame()).toContain("SyntaxError")
  })

  it("shows worker unavailability while retaining syntax validation", async () => {
    const diagnostics = {
      ...noAssistance,
      check: () => Promise.reject(new Error("Semantic validation unavailable")),
      dispose() {},
    }
    const h = await mountEditor("valid()", 90, true, undefined, { diagnostics })
    expect(h.captureCharFrame()).toContain("Semantic validation unavailable")
    await h.replace("const broken = ;")
    expect(h.captureCharFrame()).toContain("SyntaxError")
    expect(h.captureCharFrame()).not.toContain(
      "Semantic validation unavailable",
    )
  })

  it("refreshes external-file diagnostics when focus returns", async () => {
    const dir = await mkdtemp(join(tmpdir(), "noodle-editor-diagnostics-"))
    try {
      await writeFile(join(dir, "script.js"), "missingValue")
      const h = await mountEditor("./script.js", 90, true, undefined, {
        collectionDir: dir,
      })
      expect(h.captureCharFrame()).toContain("JavaScript at 1:1")
      h.beginDiagnostics()
      await h.focus(false)
      await h.settle()
      await writeFile(join(dir, "script.js"), 'console.log("fixed")')
      h.beginDiagnostics()
      await h.focus(true)
      await h.settle()
      expect(h.captureCharFrame()).not.toContain("JavaScript at")
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it.each([
    { scope: "request", scopeId: "a", path: "a.yml" },
    { scope: "folder", scopeId: "users", path: "users/folder.yml" },
    { scope: "collection", path: "settings.yml" },
  ] satisfies ScriptSource[])(
    "registers the current $scope draft and clears it when focus leaves",
    async (source) => {
      const h = await mountEditor("./original.js", 90, true, source)
      expect(h.active()).toEqual({ value: "./original.js", source })
      await h.replace("./changed.js")
      expect(h.active()).toEqual({ value: "./changed.js", source })
      await h.focus(false)
      expect(h.active()).toBeNull()
      await h.focus(true)
      expect(h.active()?.value).toBe("./changed.js")
      await h.replace("console.log(1)")
      expect(h.active()).toBeNull()
    },
  )

  it.each([
    { scope: "request", scopeId: "a", path: "a.yml" },
    { scope: "folder", scopeId: "users", path: "users/folder.yml" },
    { scope: "collection", path: "settings.yml" },
  ] satisfies ScriptSource[])(
    "opens the current $scope draft from the link beside the file description",
    async (source) => {
      const h = await mountEditor("./original.js", 90, false, source)
      const link = h.renderer.root.findDescendantById(
        "script-external-editor-link",
      )!
      const path = h.renderer.root.findDescendantById("script-path")!
      expect(link.y).toBe(path.y + 1)
      expect(h.captureCharFrame().split("\n")[link.y]).toContain(
        "Relative to the collection root. Open in external editor.",
      )
      expect(path.x + path.width).toBe(90)
      const click = async () => {
        await act(async () => h.mockMouse.click(link.x + 1, link.y))
        await h.renderOnce()
      }
      await click()
      expect(h.opened).toEqual([{ value: "./original.js", source }])
      expect(h.editing()).toBe(false)
      expect(h.value()).toBe("./original.js")
      await h.replace("./changed.js")
      await h.focus(false)
      expect(h.active()).toBeNull()
      await click()
      expect(h.opened.at(-1)).toEqual({ value: "./changed.js", source })
      expect(h.editing()).toBe(false)
      await h.replace("console.log(1)")
      expect(
        h.renderer.root.findDescendantById("script-external-editor-link"),
      ).toBeUndefined()
    },
  )

  it("wraps the external editor link at narrow widths and blocks clicks during overlays and jump mode", async () => {
    const h = await mountEditor("./external.js", 90, false)
    await act(async () => h.resize(30, 16))
    await h.renderOnce()
    const link = h.renderer.root.findDescendantById(
      "script-external-editor-link",
    )!
    const path = h.renderer.root.findDescendantById("script-path")!
    expect(path.width).toBeGreaterThanOrEqual(20)
    expect(link.y).toBeGreaterThan(path.y)
    expect(link.x + link.width).toBeLessThanOrEqual(30)
    expect(h.captureCharFrame()).toContain("Open in")
    expect(h.captureCharFrame()).toContain("external editor.")
    expect(h.captureCharFrame().split("\n")[path.y]).toContain("File:")
    const click = async () => {
      await act(async () => h.mockMouse.click(link.x + 1, link.y))
      await h.renderOnce()
    }
    h.keymap.setData("app.overlay", "confirm")
    await click()
    h.keymap.setData("app.overlay", "none")
    h.keymap.setData("app.jump", "active")
    await click()
    h.keymap.setData("app.jump", "inactive")
    await act(async () =>
      h.mockMouse.click(link.x + 1, link.y, MouseButtons.RIGHT),
    )
    expect(h.opened).toHaveLength(0)
    await click()
    expect(h.opened[0]?.value).toBe("./external.js")
    expect(h.editing()).toBe(false)
  })

  it.each(['console.log("inline")', "./external.js"])(
    "uses a full-width source selector for %s",
    async (value) => {
      const h = await mountEditor(value, 40, false)
      const source = h.renderer.root.findDescendantById(
        "script-source-field",
      ) as BoxRenderable
      const selector = source.getChildren()[0] as BoxRenderable
      expect(selector.width).toBe(40)
      const frame = h.captureCharFrame()
      expect(frame).not.toContain("Source:")
      expect(frame).toContain("Write inline or use a .js file.")
      expect(frame).not.toContain("See execution order.")
      expect(frame.split("\n")[0]).toContain(
        value.startsWith("./") ? "External file" : "Inline",
      )
    },
  )

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
    const container = h.renderer.root.findDescendantById("script-editor")!
    expect(editor.y + editor.height).toBe(container.y + container.height)
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
    const editor = h.editor()
    const container = h.renderer.root.findDescendantById("script-editor")!
    const fullHeight = editor.height
    expect(editor.y + editor.height).toBe(container.y + container.height)
    expect(h.captureCharFrame()).not.toMatch(/Checking syntax|Syntax valid/)
    await h.browse()
    await h.focus(false)
    expect(h.captureCharFrame()).not.toMatch(/Checking syntax|Syntax valid/)
    await h.focus(true)
    expect(h.captureCharFrame()).not.toMatch(/Checking syntax|Syntax valid/)
    await h.replace("const broken = ;")
    expect(h.captureCharFrame()).toContain("SyntaxError at 1:")
    expect(editor.height).toBe(fullHeight - 1)
    await h.replace('console.log("fixed")')
    expect(h.captureCharFrame()).not.toContain("SyntaxError")
    expect(editor.height).toBe(fullHeight)
  })

  it.each(["keyboard", "mouse"])(
    "keeps completion closed during %s navigation through existing APIs",
    async (input) => {
      const source = 'noodle.crypto.randomBytes(8, "hex")'
      const h = await mountEditor(source)
      const editor = h.editor()
      const menu = () =>
        h.renderer.root.findDescendantById("script-completion-menu")
      for (const cursor of [9, 19, 8]) {
        await act(async () => {
          if (input === "mouse") {
            await h.mockMouse.click(
              editor.x + cursor,
              editor.y,
              MouseButtons.LEFT,
            )
          } else {
            editor.cursorOffset = cursor + 1
            editor.handleKeyPress(keyEvent("left"))
          }
        })
        await h.renderOnce()
        expect(editor.cursorOffset).toBe(cursor)
        expect(menu()).toBeUndefined()
      }
      await h.focus(false)
      await h.focus(true)
      expect(menu()).toBeUndefined()
      expect(h.value()).toBe(source)
    },
  )

  it.each(["pre", "post", "tests"] as const)(
    "completes edits inside an existing API in %s scripts and keeps Escape dismissed",
    async (phase) => {
      const source = 'noodle.crypto.randomBytes(8, "hex")'
      const h = await mountEditor(source, 90, true, undefined, { phase })
      const menu = () =>
        h.renderer.root.findDescendantById("script-completion-menu")
      await act(async () => {
        h.editor().cursorOffset = "noodle.cr".length
      })
      h.beginDiagnostics()
      await act(async () => h.mockInput.typeText("y"))
      await h.settle()
      expect(h.value()).toBe('noodle.cryypto.randomBytes(8, "hex")')
      expect(menu()).toBeDefined()
      expect(h.captureCharFrame()).toContain("Bounded cryptographic helpers")
      h.beginDiagnostics()
      await act(async () => h.host.press("tab"))
      await h.settle()
      expect(h.value()).toBe(source)
      expect(menu()).toBeUndefined()

      h.beginDiagnostics()
      await act(async () => h.editor().handleKeyPress(keyEvent("backspace")))
      await h.settle()
      expect(menu()).toBeDefined()
      await act(async () => h.host.press("escape"))
      await act(async () => h.editor().handleKeyPress(keyEvent("left")))
      await act(async () => h.editor().handleKeyPress(keyEvent("right")))
      expect(menu()).toBeUndefined()
      expect(h.editing()).toBe(true)
    },
  )

  it("uses shared completion help and consumes completion and multiline keys before request commands", async () => {
    const h = await mountEditor("noodle.run.s")
    await act(async () => {
      h.editor().cursorOffset = h.editor().plainText.length
    })
    h.beginDiagnostics()
    await act(async () => h.mockInput.typeText("e"))
    await h.settle()
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
    let nextPane = 0
    h.keymap.registerLayer({
      commands: [
        {
          name: "focus.next",
          run: () => {
            nextPane++
          },
        },
      ],
    })
    await act(async () => h.host.press("tab"))
    expect(h.value()).toBe("noodle.run.set\n")
    expect(nextPane).toBe(1)
    expect(h.editing()).toBe(false)
    await act(async () => h.host.press("down"))
    await act(async () => h.host.press("escape"))
    expect(h.editing()).toBe(false)
    expect(leaked).toBe(0)
  })

  it.each(['console.log("keep")', "./external.js"])(
    "leaves source navigation to jump mode for %s",
    async (value) => {
      const h = await mountEditor(value, 60, false)
      const external = value.startsWith("./")
      if (external) await act(async () => h.host.press("down"))
      h.keymap.setData("app.jump", "active")
      const swallowed: string[] = []
      const dispose = h.keymap.intercept(
        "key",
        ({ event }) => {
          swallowed.push(event.name)
          event.preventDefault()
          event.stopPropagation()
        },
        { priority: 100 },
      )
      for (const key of ["up", "down", "tab", "return"])
        await act(async () => h.host.press(key))
      expect(swallowed).toEqual(["up", "down", "tab", "return"])
      expect(h.editing()).toBe(false)
      expect(h.value()).toBe(value)
      h.keymap.setData("app.jump", "inactive")
      dispose()
      await act(async () => h.host.press(external ? "return" : "up"))
      expect(h.editing()).toBe(true)
    },
  )

  it.each(["up", "down", "tab"])(
    "enters inline code with %s and returns to the source selector with shift+tab",
    async (key) => {
      const source = 'console.log("keep")'
      const h = await mountEditor(source, 60, false)
      await act(async () => h.host.press(key))
      expect(h.editing()).toBe(true)
      expect(h.editor().focused).toBe(true)
      await act(async () => h.host.press("tab", { shift: true }))
      expect(h.editing()).toBe(false)
      expect(h.editor().focused).toBe(false)
      await act(async () => h.host.press("return"))
      await h.renderOnce()
      expect(h.captureCharFrame()).toContain("External file")
      expect(h.value()).toBe(source)
    },
  )

  it("keeps external arrows within the controls and returns to the source selector from the path", async () => {
    const h = await mountEditor("./external.js", 60, false)
    await act(async () => h.host.press("up"))
    await act(async () => h.host.press("return"))
    await h.renderOnce()
    expect(h.captureCharFrame()).toContain("Inline")
    await act(async () => h.host.press("escape"))
    for (const key of ["tab", "escape"]) {
      await act(async () => h.host.press("down"))
      await act(async () => h.host.press("down"))
      await act(async () => h.host.press("return"))
      expect(h.editing()).toBe(true)
      if (key === "escape") {
        await act(async () => h.host.press("escape"))
        expect(h.editing()).toBe(true)
        expect(
          h.renderer.root.findDescendantById("path-completion-menu"),
        ).toBeUndefined()
      }
      await act(async () => h.host.press(key, { shift: key === "tab" }))
      expect(h.editing()).toBe(false)
      await act(async () => h.host.press("return"))
      await h.renderOnce()
      expect(h.captureCharFrame()).toContain("Inline")
      await act(async () => h.host.press("escape"))
    }
    expect(h.value()).toBe("./external.js")
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
      expect(h.renderer.root.findDescendantById("script-open")).toBeUndefined()
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
      expect(leftPane).toBe(0)
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
