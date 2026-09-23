import { afterAll, beforeAll, describe, expect, it } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { scheduler } from "node:timers/promises"
import { act, useCallback, useState } from "react"
import { extend } from "@opentui/react"
import {
  InputRenderable,
  ScrollBoxRenderable,
  TextAttributes,
} from "@opentui/core"
import { createTestKeymap } from "@opentui/keymap/testing"
import { KeymapProvider, type KeymapProviderProps } from "@opentui/keymap/react"
import { createTestRender } from "../testRender"
import { VarInput } from "../../src/ui/VarInput"
import { CodeEditorRenderable } from "../../src/ui/editor/CodeEditor"
import { CodeEditorCompletion } from "../../src/ui/editor/CodeEditorCompletion"
import { VariableCompletionInterceptor } from "../../src/ui/variable-completion/variableCompletionInterceptor"
import { ThemeProvider, THEMES } from "../../src/ui/theme"
import { createResponseExpressionCompleter } from "../../src/response"

const testRender = createTestRender()
extend({ "code-editor": CodeEditorRenderable })
const names = Array.from(
  { length: 15 },
  (_, index) => `key_needle${String(index).padStart(2, "0")}_needle`,
)
const environment = {
  name: "test",
  vars: Object.fromEntries(names.map((name) => [name, "value"])),
}
const complete = createResponseExpressionCompleter({
  headers: {},
  body: JSON.stringify(environment.vars),
})
const kinds = ["variables", "values", "paths", "code", "expressions"] as const
type Kind = (typeof kinds)[number]
let directory: string

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "noodle-autocomplete-"))
  await Promise.all(names.map((name) => writeFile(join(directory, name), "")))
  await mkdir(join(directory, "folder", "nested"), { recursive: true })
})
afterAll(async () => {
  await rm(directory, { recursive: true, force: true })
})

function initialValue(kind: Kind) {
  return kind === "variables" || kind === "code"
    ? "$NeEdLe"
    : kind === "paths"
      ? "@/NeEdLe"
      : kind === "expressions"
        ? "body.NeEdLe"
        : "NeEdLe"
}
function insertedValue(kind: Kind, index: number) {
  return (
    (kind === "variables" || kind === "code"
      ? "$"
      : kind === "paths"
        ? "@/"
        : kind === "expressions"
          ? "body."
          : "") + names[index]
  )
}
function menuId(kind: Kind) {
  return kind === "paths"
    ? "path-completion-menu"
    : kind === "values" || kind === "expressions"
      ? "value-completion-menu"
      : "var-completion-menu"
}

function Harness({
  kind,
  candidates = names,
}: {
  kind: Kind
  candidates?: string[]
}) {
  const [value, setValue] = useState(initialValue(kind))
  const [editor, setEditor] = useState<CodeEditorRenderable | null>(null)
  const attachEditor = useCallback((next: CodeEditorRenderable | null) => {
    setEditor(next)
    next?.focus()
    if (next) next.cursorOffset = next.plainText.length
  }, [])
  if (kind === "code")
    return (
      <box width="100%" height={10}>
        <code-editor
          id="completion-editor"
          ref={attachEditor}
          filetype="json"
          theme={THEMES[0]!}
          initialValue={value}
          onSourceChange={() => {
            if (editor) setValue(editor.plainText)
          }}
        />
        <CodeEditorCompletion
          editor={editor}
          env={environment}
          isEditing
          value={value}
        />
      </box>
    )
  return (
    <VarInput
      value={value}
      env={environment}
      isEditing
      onChange={setValue}
      variableAware={kind === "variables"}
      completionValues={
        kind === "values"
          ? candidates
          : kind === "expressions"
            ? complete(value)
            : undefined
      }
      pathCompletion={
        kind === "paths" ? { kind: "file", root: directory } : undefined
      }
    />
  )
}

async function mount(
  kind: Kind,
  content = <Harness kind={kind} />,
  firstLabel = names[0]!,
) {
  const { keymap, host, cleanup } = createTestKeymap()
  const view = await testRender(
    <KeymapProvider keymap={keymap as unknown as KeymapProviderProps["keymap"]}>
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <VariableCompletionInterceptor />
        {content}
      </ThemeProvider>
    </KeymapProvider>,
    { width: 65, height: 18 },
  )
  const render = async () => {
    await act(async () => {
      await view.renderOnce()
    })
  }
  const deadline = Date.now() + 2000
  while (!view.captureCharFrame().includes(firstLabel)) {
    if (Date.now() > deadline)
      throw new Error(
        `Autocomplete did not render:\n${view.captureCharFrame()}`,
      )
    await act(async () => {
      await scheduler.yield()
      await view.renderOnce()
    })
  }
  const scroll = () =>
    view.renderer.root.findDescendantById(
      `${menuId(kind)}-scroll`,
    ) as ScrollBoxRenderable
  const editor = () =>
    (kind === "code"
      ? view.renderer.root.findDescendantById("completion-editor")
      : view.renderer.currentFocusedRenderable) as
      | InputRenderable
      | CodeEditorRenderable
  const press = async (key: string) => {
    await act(async () => {
      host.press(key)
    })
    await render()
  }
  return { ...view, render, press, scroll, editor, cleanup }
}

describe("shared autocomplete", () => {
  it("keeps Tab browsing directories and Return finalizing a directory selection", async () => {
    function DirectoryHarness() {
      const [value, setValue] = useState("@/folder")
      return (
        <VarInput
          value={value}
          env={null}
          isEditing
          onChange={setValue}
          pathCompletion={{ kind: "directory", root: directory }}
        />
      )
    }
    const view = await mount("paths", <DirectoryHarness />, "folder/")
    try {
      const editor = view.editor()
      await view.press("tab")
      expect(editor.plainText).toBe("@/folder/")
      const deadline = Date.now() + 2000
      while (!view.captureCharFrame().includes("nested/")) {
        if (Date.now() > deadline)
          throw new Error("Nested directory did not load")
        await act(async () => {
          await scheduler.yield()
          await view.renderOnce()
        })
      }
      expect(
        view
          .captureSpans()
          .lines.flatMap((line) => line.spans)
          .some((span) => (span.attributes & TextAttributes.UNDERLINE) !== 0),
      ).toBe(false)
      await view.press("return")
      expect(editor.plainText).toBe("@/folder/nested")
      expect(
        view.renderer.root.findDescendantById(menuId("paths")),
      ).toBeUndefined()
    } finally {
      view.cleanup()
    }
  })
  it.each([...kinds])(
    "scrolls, wraps, highlights, and accepts all %s suggestions with the keyboard",
    async (kind) => {
      const view = await mount(kind)
      try {
        expect(view.scroll().viewport.height).toBe(10)
        expect(view.scroll().verticalScrollBar.visible).toBe(true)
        const matches = view
          .captureSpans()
          .lines.flatMap((line) => line.spans)
          .filter((span) => (span.attributes & TextAttributes.UNDERLINE) !== 0)
        expect(matches.length).toBe(20)
        expect(
          matches.every(
            (span) =>
              span.text === "needle" &&
              (span.attributes & TextAttributes.BOLD) !== 0,
          ),
        ).toBe(true)
        await view.press("up")
        expect(view.captureCharFrame()).toContain(names[14]!)
        expect(view.scroll().scrollTop).toBe(5)
        await view.press("down")
        expect(view.scroll().scrollTop).toBe(0)
        for (let index = 0; index < 11; index++) await view.press("down")
        expect(view.captureCharFrame()).toContain(names[11]!)
        expect(view.scroll().scrollTop).toBeGreaterThan(0)
        const editor = view.editor()
        await view.press("tab")
        expect(editor.plainText).toBe(insertedValue(kind, 11))
        expect(editor.focused).toBe(true)
        expect(
          view.renderer.root.findDescendantById(menuId(kind)),
        ).toBeUndefined()
      } finally {
        view.cleanup()
      }
    },
  )

  it.each([...kinds])(
    "scrolls and accepts %s suggestions beyond the tenth row with the mouse",
    async (kind) => {
      const view = await mount(kind)
      try {
        const scroll = view.scroll()
        const editor = view.editor()
        await act(async () => {
          await view.mockMouse.scroll(
            scroll.viewport.x + 1,
            scroll.viewport.y + 1,
            "down",
          )
        })
        await view.render()
        expect(scroll.scrollTop).toBeGreaterThan(0)
        expect(editor.focused).toBe(true)
        const slider = scroll.verticalScrollBar.slider
        await act(async () => {
          await view.mockMouse.drag(
            slider.x,
            slider.y,
            slider.x,
            slider.y + slider.height - 1,
          )
        })
        await view.render()
        expect(view.captureCharFrame()).toContain(names[14]!)
        const row = view.renderer.root.findDescendantById(
          `${menuId(kind)}-item-14`,
        )!
        await act(async () => {
          await view.mockMouse.click(row.x + 1, row.y)
        })
        await view.render()
        expect(editor.plainText).toBe(insertedValue(kind, 14))
        expect(editor.focused).toBe(true)
      } finally {
        view.cleanup()
      }
    },
  )

  it("resets scrolling after filtering and keeps the popup inside a resized terminal", async () => {
    const view = await mount("values")
    try {
      await view.press("up")
      await act(async () => {
        view.resize(23, 7)
      })
      await view.render()
      await view.render()
      const popup = view.renderer.root.findDescendantById(menuId("values"))!
      expect(popup.x).toBeGreaterThanOrEqual(0)
      expect(popup.y).toBeGreaterThanOrEqual(0)
      expect(popup.x + popup.width).toBeLessThanOrEqual(23)
      expect(popup.y + popup.height).toBeLessThanOrEqual(7)
      expect(view.scroll().viewport.height).toBe(5)
      expect(view.scroll().horizontalScrollBar.visible).toBe(false)
      await act(async () => {
        await view.mockInput.typeText("0")
      })
      await view.render()
      expect(view.scroll().scrollTop).toBe(0)
      const editor = view.editor()
      await view.press("return")
      expect(editor.plainText).toBe(names[0]!)
    } finally {
      view.cleanup()
    }
  })

  it("clamps selection when the candidate list shrinks and hides an unneeded scrollbar", async () => {
    let update: (next: string[]) => void = () => {}
    function ChangingCandidates() {
      const [candidates, setCandidates] = useState(names)
      update = setCandidates
      return <Harness kind="values" candidates={candidates} />
    }
    const view = await mount("values", <ChangingCandidates />)
    try {
      await view.press("up")
      await act(async () => {
        update(names.slice(0, 2))
      })
      await view.render()
      expect(view.scroll().verticalScrollBar.visible).toBe(false)
      expect(view.scroll().scrollTop).toBe(0)
      const editor = view.editor()
      await view.press("return")
      expect(editor.plainText).toBe(names[1]!)
    } finally {
      view.cleanup()
    }
  })
})
