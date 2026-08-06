import { describe, expect, it } from "bun:test"
import { act } from "react"
import { testRender } from "@opentui/react/test-utils"
import { extend } from "@opentui/react"
import { LineNumberRenderable } from "@opentui/core"
import { MouseButtons } from "@opentui/core/testing"
import {
  CodeEditorRenderable,
  CodeEditorScrollBarRenderable,
} from "../../src/ui/editor/CodeEditor"
import { syncCodeEditorGutter } from "../../src/ui/editor/codeEditorGutter"
import { opencodeTheme } from "../../src/ui/theme-data"
import { getHighlightCount, keyEvent } from "./_helpers"

extend({ "code-editor": CodeEditorRenderable })

describe("CodeEditorRenderable", () => {
  function computeFolds(editor: CodeEditorRenderable): void {
    ;(
      editor as unknown as { computeFoldRanges: () => void }
    ).computeFoldRanges()
  }

  it("collapses folded rows into the fold summary", async () => {
    let editor: CodeEditorRenderable | null = null
    const content = `{
  "first": 1,
  "second": 2
}`
    const originalLineCount = content.split("\n").length

    const { renderOnce, captureCharFrame } = await testRender(
      <box width={40} height={8}>
        <code-editor
          ref={(r) => {
            editor = r
          }}
          filetype="json"
          theme={opencodeTheme}
          initialValue={content}
          debounceMs={0}
          backgroundColor={opencodeTheme.backgroundPanel}
          focusedBackgroundColor={opencodeTheme.backgroundPanel}
          textColor={opencodeTheme.text}
          cursorColor={opencodeTheme.primary}
        />
      </box>,
      { width: 40, height: 8 },
    )

    await renderOnce()
    expect(editor).toBeDefined()
    computeFolds(editor!)
    editor!.toggleFold(0)
    await renderOnce()

    const frame = captureCharFrame()
    expect(frame).toContain("{... } (3 lines)")
    expect(frame).not.toContain('"second"')
    expect(editor!.lineCount).toBeLessThan(originalLineCount)
    expect(editor!.plainText).toBe(content)
    expect(editor!.getHiddenLineNumbers()).toEqual(new Set())
    expect(getHighlightCount(editor!)).toBeGreaterThan(0)
  })

  it("uses f5 to fold all and f6 to unfold all", async () => {
    let editor: CodeEditorRenderable | null = null
    const content = `{
  "first": 1,
  "second": {
    "nested": true
  }
}`
    const originalLineCount = content.split("\n").length

    const { renderOnce } = await testRender(
      <box width={48} height={8}>
        <code-editor
          ref={(r) => {
            editor = r
          }}
          filetype="json"
          theme={opencodeTheme}
          initialValue={content}
          debounceMs={0}
          backgroundColor={opencodeTheme.backgroundPanel}
          focusedBackgroundColor={opencodeTheme.backgroundPanel}
          textColor={opencodeTheme.text}
          cursorColor={opencodeTheme.primary}
        />
      </box>,
      { width: 48, height: 8 },
    )

    await renderOnce()
    expect(editor).toBeDefined()
    computeFolds(editor!)

    const folded = editor!.handleKeyPress(keyEvent("f5"))
    expect(folded).toBe(true)
    await renderOnce()
    expect(editor!.lineCount).toBeLessThan(originalLineCount)

    const unfolded = editor!.handleKeyPress(keyEvent("f6"))
    expect(unfolded).toBe(true)
    await renderOnce()
    expect(editor!.lineCount).toBe(originalLineCount)
    expect(editor!.plainText).toBe(content)
  })

  it("uses ctrl+z to undo", async () => {
    let editor: CodeEditorRenderable | null = null
    const { renderOnce } = await testRender(
      <box width={40} height={8}>
        <code-editor
          ref={(r) => {
            editor = r
          }}
          filetype="json"
          theme={opencodeTheme}
          initialValue="{}"
          debounceMs={0}
          backgroundColor={opencodeTheme.backgroundPanel}
          focusedBackgroundColor={opencodeTheme.backgroundPanel}
          textColor={opencodeTheme.text}
          cursorColor={opencodeTheme.primary}
        />
      </box>,
      { width: 40, height: 8 },
    )

    await renderOnce()
    editor!.focus()
    editor!.setCursor(0, 1)
    editor!.insertText("x")
    await renderOnce()
    expect(editor!.plainText).toBe("{x}")

    const handled = editor!.handleKeyPress(keyEvent("z", { ctrl: true }))
    expect(handled).toBe(true)
    expect(editor!.plainText).toBe("{}")
  })

  it("inserts a newline on shift+return", async () => {
    let editor: CodeEditorRenderable | null = null
    const content = `{"name":"hello"}`

    const { renderOnce } = await testRender(
      <box width={40} height={8}>
        <code-editor
          ref={(r) => {
            editor = r
          }}
          filetype="json"
          theme={opencodeTheme}
          initialValue={content}
          debounceMs={0}
          backgroundColor={opencodeTheme.backgroundPanel}
          focusedBackgroundColor={opencodeTheme.backgroundPanel}
          textColor={opencodeTheme.text}
          cursorColor={opencodeTheme.primary}
        />
      </box>,
      { width: 40, height: 8 },
    )

    await renderOnce()
    expect(editor).toBeDefined()
    editor!.setCursor(0, content.length)

    const handled = editor!.handleKeyPress(keyEvent("return", { shift: true }))
    expect(handled).toBe(true)
    await renderOnce()
    expect(editor!.plainText).toBe(`${content}\n`)
  })

  it("syncs an external value", async () => {
    let editor: CodeEditorRenderable | null = null

    const { renderOnce } = await testRender(
      <box width={40} height={8}>
        <code-editor
          ref={(r) => {
            editor = r
          }}
          filetype="json"
          theme={opencodeTheme}
          initialValue='{"first":true}'
          backgroundColor={opencodeTheme.backgroundPanel}
          focusedBackgroundColor={opencodeTheme.backgroundPanel}
          textColor={opencodeTheme.text}
          cursorColor={opencodeTheme.primary}
        />
      </box>,
      { width: 40, height: 8 },
    )

    await renderOnce()
    editor!.value = '{"second":false}'
    await renderOnce()

    expect(editor!.plainText).toBe('{"second":false}')
  })

  it("scrolls to keep a moved cursor visible", async () => {
    let editor: CodeEditorRenderable | null = null
    const content = Array.from({ length: 20 }, (_, i) => `"line${i}",`).join(
      "\n",
    )

    const { renderOnce } = await testRender(
      <box width={40} height={3}>
        <code-editor
          ref={(r) => {
            editor = r
          }}
          filetype="json"
          theme={opencodeTheme}
          initialValue={content}
          debounceMs={0}
          scrollMargin={0}
          backgroundColor={opencodeTheme.backgroundPanel}
          focusedBackgroundColor={opencodeTheme.backgroundPanel}
          textColor={opencodeTheme.text}
          cursorColor={opencodeTheme.primary}
        />
      </box>,
      { width: 40, height: 3 },
    )

    await renderOnce()
    editor!.handleKeyPress(keyEvent("down"))
    await renderOnce()

    expect(editor!.scrollY).toBe(0)

    for (let i = 0; i < 10; i++) editor!.handleKeyPress(keyEvent("down"))
    await renderOnce()

    expect(editor!.scrollY).toBeGreaterThan(0)
  })

  it("keeps wrapped scrollbar navigation exact while blurred and focused", async () => {
    let editor: CodeEditorRenderable | null = null
    const content = JSON.stringify(
      {
        message: "wrapped content ".repeat(200),
        tail: "end",
      },
      null,
      2,
    )

    const { renderer, renderOnce } = await testRender(
      <box width={30} height={6}>
        <code-editor
          ref={(r) => {
            editor = r
          }}
          filetype="json"
          theme={opencodeTheme}
          initialValue={content}
          debounceMs={0}
          scrollMargin={0}
          backgroundColor={opencodeTheme.backgroundPanel}
          focusedBackgroundColor={opencodeTheme.backgroundPanel}
          textColor={opencodeTheme.text}
          cursorColor={opencodeTheme.primary}
        />
      </box>,
      { width: 30, height: 6 },
    )

    await renderOnce()
    await renderOnce()
    const maxPosition = editor!.totalVirtualLineCount - editor!.viewport.height
    const ascending = Array.from({ length: maxPosition + 1 }, (_, i) => i)
    const descending = ascending.toReversed()

    expect(editor!.totalVirtualLineCount).toBeGreaterThan(editor!.lineCount)

    for (const focused of [false, true]) {
      if (focused) editor!.focus()
      else editor!.blur()

      for (const positions of [ascending, descending]) {
        for (const position of positions) {
          editor!.scrollTo(position)
          await renderOnce()
          expect(editor!.scrollY).toBe(position)
          expect(editor!.focused).toBe(focused)
        }
      }

      expect(renderer.getCursorState().visible).toBe(focused)
    }
  })

  it("preserves the selection and logical cursor when scrolling directly", async () => {
    let editor: CodeEditorRenderable | null = null
    const content = Array.from(
      { length: 40 },
      (_, index) => `"line${index}"`,
    ).join("\n")

    const { renderOnce } = await testRender(
      <box width={30} height={6}>
        <code-editor
          ref={(r) => {
            editor = r
          }}
          filetype="json"
          theme={opencodeTheme}
          initialValue={content}
          debounceMs={0}
          scrollMargin={0}
          backgroundColor={opencodeTheme.backgroundPanel}
          focusedBackgroundColor={opencodeTheme.backgroundPanel}
          textColor={opencodeTheme.text}
          cursorColor={opencodeTheme.primary}
        />
      </box>,
      { width: 30, height: 6 },
    )

    await renderOnce()
    editor!.setSelection(1, 6)
    const cursor = editor!.logicalCursor

    editor!.scrollTo(10)
    await renderOnce()

    expect(editor!.scrollY).toBe(10)
    expect(editor!.getSelection()).toEqual({ start: 1, end: 6 })
    expect(editor!.getSelectedText()).toBe("line0")
    expect(editor!.logicalCursor).toEqual(cursor)
  })

  it("keeps the logical cursor while a scrollbar follows editor scrolling", async () => {
    let editor: CodeEditorRenderable | null = null
    const content = Array.from(
      { length: 40 },
      (_, index) => `"line${index}"`,
    ).join("\n")

    const { renderer, renderOnce } = await testRender(
      <box width={30} height={6}>
        <code-editor
          ref={(r) => {
            editor = r
          }}
          filetype="json"
          theme={opencodeTheme}
          initialValue={content}
          debounceMs={0}
          scrollMargin={0}
          backgroundColor={opencodeTheme.backgroundPanel}
          focusedBackgroundColor={opencodeTheme.backgroundPanel}
          textColor={opencodeTheme.text}
          cursorColor={opencodeTheme.primary}
        />
      </box>,
      { width: 30, height: 6 },
    )

    await renderOnce()
    const scrollbar = new CodeEditorScrollBarRenderable(renderer, {
      target: editor,
      position: "absolute",
      left: 29,
      width: 1,
      height: 6,
    })
    renderer.root.add(scrollbar)
    await renderOnce()

    for (let index = 0; index < 5; index++) {
      editor!.handleKeyPress(keyEvent("down"))
      await renderOnce()
    }

    expect(editor!.scrollY).toBeGreaterThan(0)
    expect(editor!.logicalCursor).toMatchObject({ row: 5, col: 0 })
    scrollbar.destroy()
    renderer.destroy()
  })

  it("tears down an editor before its scrollbar", async () => {
    const { renderer, renderOnce } = await testRender(<box />, {
      width: 30,
      height: 6,
    })
    const editor = new CodeEditorRenderable(renderer, {
      filetype: "json",
      theme: opencodeTheme,
      initialValue: '"line"',
    })
    const scrollbar = new CodeEditorScrollBarRenderable(renderer, {
      target: editor,
      position: "absolute",
      width: 1,
      height: 6,
    })
    renderer.root.add(editor)
    renderer.root.add(scrollbar)
    await renderOnce()

    let teardownError: unknown
    try {
      editor.destroy()
      await renderOnce()
    } catch (error) {
      teardownError = error
    }
    scrollbar.destroy()
    renderer.destroy()

    expect(teardownError).toBeUndefined()
  })

  it("does not move the cursor for a zero scroll delta", async () => {
    let editor: CodeEditorRenderable | null = null
    const { renderOnce } = await testRender(
      <box width={40} height={3}>
        <code-editor
          ref={(r) => {
            editor = r
          }}
          filetype="json"
          theme={opencodeTheme}
          initialValue={'"line0"\n"line1"'}
          debounceMs={0}
          backgroundColor={opencodeTheme.backgroundPanel}
          focusedBackgroundColor={opencodeTheme.backgroundPanel}
          textColor={opencodeTheme.text}
          cursorColor={opencodeTheme.primary}
        />
      </box>,
      { width: 40, height: 3 },
    )
    await renderOnce()

    let moves = 0
    editor!.moveCursorDown = () => {
      moves++
      return true
    }
    editor!.scrollBy(0)

    expect(moves).toBe(0)
  })

  it("folds nested JSON ranges by their own start line", async () => {
    let editor: CodeEditorRenderable | null = null
    const content = `{
  "outer": {
    "inner": true
  },
  "after": false
}`

    const { renderOnce, captureCharFrame } = await testRender(
      <box width={60} height={8}>
        <code-editor
          ref={(r) => {
            editor = r
          }}
          filetype="json"
          theme={opencodeTheme}
          initialValue={content}
          debounceMs={0}
          backgroundColor={opencodeTheme.backgroundPanel}
          focusedBackgroundColor={opencodeTheme.backgroundPanel}
          textColor={opencodeTheme.text}
          cursorColor={opencodeTheme.primary}
        />
      </box>,
      { width: 60, height: 8 },
    )

    await renderOnce()
    expect(editor).toBeDefined()
    computeFolds(editor!)

    expect(Array.from(editor!.getFolds().keys())).toEqual([1, 0])

    editor!.toggleFold(1)
    await renderOnce()

    const frame = captureCharFrame()
    expect(frame).toContain('"outer": {... } (2 lines)')
    expect(frame).not.toContain('"inner"')
    expect(frame).toContain('"after"')
    expect(editor!.lineCount).toBe(4)
    expect(editor!.plainText).toBe(content)
    expect(editor!.getHiddenLineNumbers()).toEqual(new Set())
  })

  it("removes gutter rows for folded interior lines", async () => {
    let editor: CodeEditorRenderable | null = null
    let lineNumber: LineNumberRenderable | null = null
    const content = `{
  "alpha": true,
  "beta": false
}`

    const syncGutter = () => {
      if (!editor || !lineNumber) return
      lineNumber.setLineSigns(editor.getFoldSigns())
      lineNumber.setLineNumbers(editor.getDisplayLineNumbers())
      lineNumber.setHideLineNumbers(editor.getHiddenLineNumbers())
    }

    const { renderOnce, captureCharFrame } = await testRender(
      <box width={60} height={8}>
        <line-number
          ref={(r) => {
            lineNumber = r
          }}
          minWidth={3}
          paddingRight={1}
          fg={opencodeTheme.textMuted}
          bg={opencodeTheme.backgroundPanel}
          width="100%"
        >
          <code-editor
            ref={(r) => {
              editor = r
            }}
            filetype="json"
            theme={opencodeTheme}
            initialValue={content}
            debounceMs={0}
            onFoldsChange={syncGutter}
            backgroundColor={opencodeTheme.backgroundPanel}
            focusedBackgroundColor={opencodeTheme.backgroundPanel}
            textColor={opencodeTheme.text}
            cursorColor={opencodeTheme.primary}
          />
        </line-number>
      </box>,
      { width: 60, height: 8 },
    )

    await renderOnce()
    expect(editor).toBeDefined()
    computeFolds(editor!)
    syncGutter()
    editor!.toggleFold(0)
    await renderOnce()

    const frame = captureCharFrame()
    expect(frame).toContain("1")
    expect(frame).toContain("{... } (3 lines)")
    expect(frame).not.toContain('"alpha"')
    expect(editor!.lineCount).toBe(1)
  })

  it("keeps source line numbers after a collapsed range", async () => {
    let editor: CodeEditorRenderable | null = null
    let lineNumber: LineNumberRenderable | null = null
    const content = `{
  "before": true,
  "group": {
    "value": true
  },
  "after": "next"
}`

    const syncGutter = () => {
      if (!editor || !lineNumber) return
      lineNumber.setLineNumbers(editor.getDisplayLineNumbers())
    }

    const { renderOnce, captureCharFrame } = await testRender(
      <box width={60} height={8}>
        <line-number
          ref={(r) => {
            lineNumber = r
          }}
          minWidth={3}
          paddingRight={1}
          fg={opencodeTheme.textMuted}
          bg={opencodeTheme.backgroundPanel}
          width="100%"
        >
          <code-editor
            ref={(r) => {
              editor = r
            }}
            filetype="json"
            theme={opencodeTheme}
            initialValue={content}
            debounceMs={0}
            onFoldsChange={syncGutter}
            backgroundColor={opencodeTheme.backgroundPanel}
            focusedBackgroundColor={opencodeTheme.backgroundPanel}
            textColor={opencodeTheme.text}
            cursorColor={opencodeTheme.primary}
          />
        </line-number>
      </box>,
      { width: 60, height: 8 },
    )

    await renderOnce()
    computeFolds(editor!)
    editor!.toggleFold(2)
    syncGutter()
    await renderOnce()

    expect(lineNumber!.getLineNumbers()).toEqual(
      new Map([
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 6],
        [4, 7],
      ]),
    )
    const afterLine = captureCharFrame()
      .split("\n")
      .find((line) => line.includes('"after"'))
    expect(afterLine).toMatch(/\b6\s+"after"/)

    editor!.unfoldAll()
    syncGutter()
    await renderOnce()
    expect(lineNumber!.getLineNumbers()).toEqual(new Map())
  })

  it("reports when gutter synchronization has no gutter", async () => {
    const { renderer } = await testRender(<box />, {
      width: 30,
      height: 6,
    })
    const editor = new CodeEditorRenderable(renderer, {
      filetype: "json",
      theme: opencodeTheme,
      initialValue: "{}",
    })
    const lineNumber = new LineNumberRenderable(renderer, {})

    expect(() => syncCodeEditorGutter(lineNumber, editor)).toThrow(
      "syncCodeEditorGutter: line-number gutter is unavailable",
    )

    lineNumber.destroy()
    editor.destroy()
    renderer.destroy()
  })

  it("collapses a nested JSON array without leaving blank editor rows", async () => {
    let editor: CodeEditorRenderable | null = null
    const content = `{
  "title": "My First Blog Post",
  "tags": [
    "javascript",
    "tutorial",
    "web-development"
  ],
  "category": "technology"
}`
    const originalLineCount = content.split("\n").length

    const { renderOnce, captureCharFrame } = await testRender(
      <box width={80} height={10}>
        <code-editor
          ref={(r) => {
            editor = r
          }}
          filetype="json"
          theme={opencodeTheme}
          initialValue={content}
          debounceMs={0}
          backgroundColor={opencodeTheme.backgroundPanel}
          focusedBackgroundColor={opencodeTheme.backgroundPanel}
          textColor={opencodeTheme.text}
          cursorColor={opencodeTheme.primary}
        />
      </box>,
      { width: 80, height: 10 },
    )

    await renderOnce()
    expect(editor).toBeDefined()
    computeFolds(editor!)
    editor!.toggleFold(2)
    await renderOnce()

    const frame = captureCharFrame()
    expect(frame).toContain('"tags": [... ] (4 lines)')
    expect(frame).not.toContain('"javascript"')
    expect(frame).not.toContain('"tutorial"')
    expect(frame).not.toContain('"web-development"')
    expect(frame).toContain('"category"')
    expect(editor!.lineCount).toBe(originalLineCount - 4)
    expect(editor!.plainText).toBe(content)
    expect(getHighlightCount(editor!)).toBeGreaterThan(0)
  })

  it("converts extra highlight offsets across multiline content", async () => {
    let editor: CodeEditorRenderable | null = null
    const content = '{\n  "url": "$base_url"\n}'

    const { renderOnce } = await testRender(
      <box width={40} height={4}>
        <code-editor
          ref={(r) => {
            editor = r
          }}
          filetype="json"
          theme={opencodeTheme}
          initialValue={content}
          debounceMs={0}
          extraHighlights={(value) => {
            if (!editor) return []
            const start = value.indexOf("$base_url")
            return [
              {
                start,
                end: start + 9,
                styleId: editor.envResolvedStyleId,
                priority: 2,
              },
            ]
          }}
          backgroundColor={opencodeTheme.backgroundPanel}
          focusedBackgroundColor={opencodeTheme.backgroundPanel}
          textColor={opencodeTheme.text}
          cursorColor={opencodeTheme.primary}
        />
      </box>,
      { width: 40, height: 4 },
    )

    await renderOnce()
    await new Promise((resolve) => setTimeout(resolve, 20))
    await renderOnce()
    const highlights = editor!.getLineHighlights(1)
    expect(
      highlights.some(
        (highlight) =>
          highlight.styleId === editor!.envResolvedStyleId &&
          highlight.start === 10 &&
          highlight.end === 19,
      ),
    ).toBe(true)
  })

  it("keeps YAML highlighting when folded", async () => {
    let editor: CodeEditorRenderable | null = null
    const content = `name: demo
headers:
  accept: application/json
  x-enabled: true
body:
  title: hello
  published: true`

    const { renderOnce, captureCharFrame } = await testRender(
      <box width={80} height={10}>
        <code-editor
          ref={(r) => {
            editor = r
          }}
          filetype="yaml"
          theme={opencodeTheme}
          initialValue={content}
          debounceMs={0}
          backgroundColor={opencodeTheme.backgroundPanel}
          focusedBackgroundColor={opencodeTheme.backgroundPanel}
          textColor={opencodeTheme.text}
          cursorColor={opencodeTheme.primary}
        />
      </box>,
      { width: 80, height: 10 },
    )

    await renderOnce()
    expect(editor).toBeDefined()
    computeFolds(editor!)
    editor!.toggleFold(1)
    await renderOnce()

    const frame = captureCharFrame()
    expect(frame).toContain("headers:")
    expect(frame).not.toContain("accept")
    expect(frame).toContain("body:")
    expect(getHighlightCount(editor!)).toBeGreaterThan(0)
  })

  it("preserves cursor position when typing on an unfolded line while YAML is folded", async () => {
    let editor: CodeEditorRenderable | null = null
    const content = `name: demo
body:
  title: hello
  published: true
body_type: json`

    const { renderOnce, captureCharFrame } = await testRender(
      <box width={80} height={10}>
        <code-editor
          ref={(r) => {
            editor = r
          }}
          filetype="yaml"
          theme={opencodeTheme}
          initialValue={content}
          debounceMs={0}
          backgroundColor={opencodeTheme.backgroundPanel}
          focusedBackgroundColor={opencodeTheme.backgroundPanel}
          textColor={opencodeTheme.text}
          cursorColor={opencodeTheme.primary}
        />
      </box>,
      { width: 80, height: 10 },
    )

    await renderOnce()
    expect(editor).toBeDefined()
    computeFolds(editor!)
    editor!.toggleFold(1)
    await renderOnce()

    editor!.setCursor(2, "body_type: ".length)
    editor!.handleKeyPress(keyEvent("1"))
    await renderOnce()

    expect(editor!.plainText).toContain("body_type: 1json")
    expect(editor!.plainText.startsWith("1name:")).toBe(false)
    expect(editor!.lineCount).toBe(3)
    const frame = captureCharFrame()
    expect(frame).toContain("body:")
    expect(frame).not.toContain("title: hello")
  })

  it("restores source text and highlights after YAML toggleFold unfolds the last fold", async () => {
    let editor: CodeEditorRenderable | null = null
    const content = `name: demo
body:
  title: hello
  published: true`
    const originalLineCount = content.split("\n").length

    const { renderOnce } = await testRender(
      <box width={80} height={10}>
        <code-editor
          ref={(r) => {
            editor = r
          }}
          filetype="yaml"
          theme={opencodeTheme}
          initialValue={content}
          debounceMs={0}
          backgroundColor={opencodeTheme.backgroundPanel}
          focusedBackgroundColor={opencodeTheme.backgroundPanel}
          textColor={opencodeTheme.text}
          cursorColor={opencodeTheme.primary}
        />
      </box>,
      { width: 80, height: 10 },
    )

    await renderOnce()
    expect(editor).toBeDefined()
    computeFolds(editor!)

    editor!.toggleFold(1)
    await renderOnce()
    expect(editor!.lineCount).toBeLessThan(originalLineCount)

    editor!.toggleFold(1)
    await renderOnce()
    expect(editor!.lineCount).toBe(originalLineCount)
    expect(editor!.plainText).toBe(content)

    await new Promise((resolve) => setTimeout(resolve, 30))
    await renderOnce()
    expect(getHighlightCount(editor!)).toBeGreaterThan(0)
  })

  it("restores source text and highlights after YAML unfoldAll", async () => {
    let editor: CodeEditorRenderable | null = null
    const content = `name: demo
headers:
  accept: application/json
  x-enabled: true
body:
  title: hello
  published: true`
    const originalLineCount = content.split("\n").length

    const { renderOnce } = await testRender(
      <box width={80} height={10}>
        <code-editor
          ref={(r) => {
            editor = r
          }}
          filetype="yaml"
          theme={opencodeTheme}
          initialValue={content}
          debounceMs={0}
          backgroundColor={opencodeTheme.backgroundPanel}
          focusedBackgroundColor={opencodeTheme.backgroundPanel}
          textColor={opencodeTheme.text}
          cursorColor={opencodeTheme.primary}
        />
      </box>,
      { width: 80, height: 10 },
    )

    await renderOnce()
    expect(editor).toBeDefined()
    computeFolds(editor!)

    editor!.foldAll()
    await renderOnce()
    expect(editor!.lineCount).toBeLessThan(originalLineCount)

    editor!.unfoldAll()
    await renderOnce()
    expect(editor!.lineCount).toBe(originalLineCount)
    expect(editor!.plainText).toBe(content)

    await new Promise((resolve) => setTimeout(resolve, 30))
    await renderOnce()
    expect(getHighlightCount(editor!)).toBeGreaterThan(0)
  })

  it("publishes current validation when validation callback changes", async () => {
    let editor: CodeEditorRenderable | null = null
    const initialErrors: (string | null)[] = []

    const { renderOnce } = await testRender(
      <box width={40} height={8}>
        <code-editor
          ref={(r) => {
            editor = r
          }}
          filetype="json"
          theme={opencodeTheme}
          initialValue="invalid"
          validateContent={() => "Invalid JSON: test"}
          onValidationChange={(error) => initialErrors.push(error)}
          backgroundColor={opencodeTheme.backgroundPanel}
          focusedBackgroundColor={opencodeTheme.backgroundPanel}
          textColor={opencodeTheme.text}
          cursorColor={opencodeTheme.primary}
        />
      </box>,
      { width: 40, height: 8 },
    )

    await renderOnce()
    expect(initialErrors).toEqual(["Invalid JSON: test"])

    const replacementErrors: (string | null)[] = []
    editor!.onValidationChange = (error) => replacementErrors.push(error)
    editor!.validateContent = () => null

    expect(replacementErrors).toEqual(["Invalid JSON: test", null])
    expect(editor!.validationError).toBeNull()
  })

  describe("auto-close pairs", () => {
    async function setupEditor(
      content = "",
      filetype = "json",
    ): Promise<[CodeEditorRenderable, () => Promise<void>]> {
      let editor: CodeEditorRenderable | null = null
      const { renderOnce } = await testRender(
        <box width={40} height={8}>
          <code-editor
            ref={(r) => {
              editor = r
            }}
            filetype={filetype}
            theme={opencodeTheme}
            initialValue={content}
            debounceMs={0}
            backgroundColor={opencodeTheme.backgroundPanel}
            focusedBackgroundColor={opencodeTheme.backgroundPanel}
            textColor={opencodeTheme.text}
            cursorColor={opencodeTheme.primary}
          />
        </box>,
        { width: 40, height: 8 },
      )
      await renderOnce()
      return [editor!, renderOnce]
    }

    it("inserts {} for { and places cursor between", async () => {
      const [editor, renderOnce] = await setupEditor()
      const handled = editor.handleKeyPress(keyEvent("{"))
      expect(handled).toBe(true)
      await renderOnce()
      expect(editor.plainText).toBe("{}")
      expect(editor.logicalCursor.row).toBe(0)
      expect(editor.logicalCursor.col).toBe(1)
    })

    it("inserts () for ( and places cursor between", async () => {
      const [editor, renderOnce] = await setupEditor()
      const handled = editor.handleKeyPress(keyEvent("("))
      expect(handled).toBe(true)
      await renderOnce()
      expect(editor.plainText).toBe("()")
      expect(editor.logicalCursor.col).toBe(1)
    })

    it("inserts [] for [ and places cursor between", async () => {
      const [editor, renderOnce] = await setupEditor()
      const handled = editor.handleKeyPress(keyEvent("["))
      expect(handled).toBe(true)
      await renderOnce()
      expect(editor.plainText).toBe("[]")
      expect(editor.logicalCursor.col).toBe(1)
    })

    it("inserts <> for < and places cursor between", async () => {
      const [editor, renderOnce] = await setupEditor()
      const handled = editor.handleKeyPress(keyEvent("<"))
      expect(handled).toBe(true)
      await renderOnce()
      expect(editor.plainText).toBe("<>")
      expect(editor.logicalCursor.col).toBe(1)
    })

    it('inserts "" for double quote and places cursor between', async () => {
      const [editor, renderOnce] = await setupEditor()
      const handled = editor.handleKeyPress(keyEvent('"'))
      expect(handled).toBe(true)
      await renderOnce()
      expect(editor.plainText).toBe('""')
      expect(editor.logicalCursor.col).toBe(1)
    })

    it("inserts '' for single quote and places cursor between", async () => {
      const [editor, renderOnce] = await setupEditor()
      const handled = editor.handleKeyPress(keyEvent("'"))
      expect(handled).toBe(true)
      await renderOnce()
      expect(editor.plainText).toBe("''")
      expect(editor.logicalCursor.col).toBe(1)
    })

    it("auto-skips closing } when next char is }", async () => {
      const [editor] = await setupEditor("{}")
      editor.setCursor(0, 1)
      const handled = editor.handleKeyPress(keyEvent("}"))
      expect(handled).toBe(true)
      expect(editor.plainText).toBe("{}")
      expect(editor.logicalCursor.col).toBe(2)
    })

    it("auto-skips closing ) when next char is )", async () => {
      const [editor] = await setupEditor("()")
      editor.setCursor(0, 1)
      const handled = editor.handleKeyPress(keyEvent(")"))
      expect(handled).toBe(true)
      expect(editor.plainText).toBe("()")
      expect(editor.logicalCursor.col).toBe(2)
    })

    it("auto-skips closing ] when next char is ]", async () => {
      const [editor] = await setupEditor("[]")
      editor.setCursor(0, 1)
      const handled = editor.handleKeyPress(keyEvent("]"))
      expect(handled).toBe(true)
      expect(editor.plainText).toBe("[]")
      expect(editor.logicalCursor.col).toBe(2)
    })

    it('auto-skips closing " when next char is "', async () => {
      const [editor] = await setupEditor('""')
      editor.setCursor(0, 1)
      const handled = editor.handleKeyPress(keyEvent('"'))
      expect(handled).toBe(true)
      expect(editor.plainText).toBe('""')
      expect(editor.logicalCursor.col).toBe(2)
    })

    it("does not auto-skip when next char differs", async () => {
      const [editor, renderOnce] = await setupEditor("{}")
      editor.setCursor(0, 0)
      const handled = editor.handleKeyPress(keyEvent("}"))
      expect(handled).toBe(true)
      await renderOnce()
      expect(editor.plainText).toBe("}{}")
    })

    it("wraps selection with brackets", async () => {
      const [editor, renderOnce] = await setupEditor("abc")
      editor.setSelection(0, 3)
      const handled = editor.handleKeyPress(keyEvent("{"))
      expect(handled).toBe(true)
      await renderOnce()
      expect(editor.plainText).toBe("{abc}")
    })

    it("wraps selection with quotes", async () => {
      const [editor, renderOnce] = await setupEditor("hello")
      editor.setSelection(0, 5)
      const handled = editor.handleKeyPress(keyEvent('"'))
      expect(handled).toBe(true)
      await renderOnce()
      expect(editor.plainText).toBe('"hello"')
    })

    it("auto-skips closing > when next char is >", async () => {
      const [editor] = await setupEditor("<>")
      editor.setCursor(0, 1)
      const handled = editor.handleKeyPress(keyEvent(">"))
      expect(handled).toBe(true)
      expect(editor.plainText).toBe("<>")
      expect(editor.logicalCursor.col).toBe(2)
    })

    it("auto-skips closing ' when next char is '", async () => {
      const [editor] = await setupEditor("''")
      editor.setCursor(0, 1)
      const handled = editor.handleKeyPress(keyEvent("'"))
      expect(handled).toBe(true)
      expect(editor.plainText).toBe("''")
      expect(editor.logicalCursor.col).toBe(2)
    })

    it("wraps selection with parentheses", async () => {
      const [editor, renderOnce] = await setupEditor("abc")
      editor.setSelection(0, 3)
      const handled = editor.handleKeyPress(keyEvent("("))
      expect(handled).toBe(true)
      await renderOnce()
      expect(editor.plainText).toBe("(abc)")
    })

    it("wraps selection with square brackets", async () => {
      const [editor, renderOnce] = await setupEditor("abc")
      editor.setSelection(0, 3)
      const handled = editor.handleKeyPress(keyEvent("["))
      expect(handled).toBe(true)
      await renderOnce()
      expect(editor.plainText).toBe("[abc]")
    })

    it("wraps selection with angle brackets", async () => {
      const [editor, renderOnce] = await setupEditor("abc")
      editor.setSelection(0, 3)
      const handled = editor.handleKeyPress(keyEvent("<"))
      expect(handled).toBe(true)
      await renderOnce()
      expect(editor.plainText).toBe("<abc>")
    })

    it("wraps selection with single quotes", async () => {
      const [editor, renderOnce] = await setupEditor("hello")
      editor.setSelection(0, 5)
      const handled = editor.handleKeyPress(keyEvent("'"))
      expect(handled).toBe(true)
      await renderOnce()
      expect(editor.plainText).toBe("'hello'")
    })

    it("inserts {} in middle of existing content", async () => {
      const [editor, renderOnce] = await setupEditor("abc")
      editor.setCursor(0, 1)
      const handled = editor.handleKeyPress(keyEvent("{"))
      expect(handled).toBe(true)
      await renderOnce()
      expect(editor.plainText).toBe("a{}bc")
      expect(editor.logicalCursor.row).toBe(0)
      expect(editor.logicalCursor.col).toBe(2)
    })

    it("does not auto-skip close bracket in folded display", async () => {
      const content = `{
  "a": 1,
  "b": 2
}`
      const [editor, renderOnce] = await setupEditor(content, "json")
      computeFolds(editor)
      editor.toggleFold(0)
      await renderOnce()

      editor.setCursor(0, 3)
      const handled = editor.handleKeyPress(keyEvent("}"))
      expect(handled).toBe(true)
      await renderOnce()
      expect(editor.lineCount).toBeGreaterThanOrEqual(
        content.split("\n").length,
      )
    })

    it("inserts auto-close pair on visible line while folded", async () => {
      const content = `{
  "a": 1,
  "b": 2
}`
      const [editor, renderOnce] = await setupEditor(content, "json")
      computeFolds(editor)
      editor.toggleFold(0)
      await renderOnce()

      editor.setCursor(1, 0)
      const handled = editor.handleKeyPress(keyEvent("{"))
      expect(handled).toBe(true)
      await renderOnce()
      expect(editor.plainText).toContain("{}")
    })
  })
})

describe("CodeEditorRenderable read-only mode", () => {
  it("highlights the full final line after becoming read-only", async () => {
    let editor: CodeEditorRenderable | null = null
    const { renderOnce } = await testRender(
      <box width={40} height={6}>
        <code-editor
          ref={(renderable) => {
            editor = renderable
          }}
          filetype="json"
          theme={opencodeTheme}
          value="{}"
          debounceMs={0}
        />
      </box>,
      { width: 40, height: 6 },
    )
    await renderOnce()

    const readonly = editor!
    readonly.setCursor(0, 1)
    readonly.insertText('"updated": true')
    await renderOnce()
    readonly.readOnly = true
    await new Promise((resolve) => setTimeout(resolve, 10))
    await renderOnce()

    const finalLineHighlights = readonly.getLineHighlights(
      readonly.lineCount - 1,
    )
    expect(Math.max(...finalLineHighlights.map(({ end }) => end))).toBe(
      readonly.plainText.length,
    )
  })

  it("rejects mutations while retaining navigation, folding, and external updates", async () => {
    let editor: CodeEditorRenderable | null = null
    const content = `{
  "first": 1,
  "nested": {
    "value": true
  }
}`
    const { renderOnce } = await testRender(
      <box width={48} height={8}>
        <code-editor
          ref={(renderable) => {
            editor = renderable
          }}
          filetype="json"
          theme={opencodeTheme}
          value={content}
          readOnly
          backgroundColor={opencodeTheme.backgroundPanel}
          focusedBackgroundColor={opencodeTheme.backgroundPanel}
          textColor={opencodeTheme.text}
          cursorColor={opencodeTheme.primary}
        />
      </box>,
      { width: 48, height: 8 },
    )
    await new Promise((resolve) => setTimeout(resolve, 10))
    await renderOnce()

    expect(editor).toBeDefined()
    const readonly = editor!
    const cursorBefore = readonly.logicalCursor.col
    expect(readonly.handleKeyPress(keyEvent("x"))).toBe(false)
    expect(readonly.handleKeyPress(keyEvent("z", { ctrl: true }))).toBe(false)
    readonly.handlePaste({ text: "mutated" } as never)
    expect(readonly.plainText).toBe(content)

    expect(readonly.handleKeyPress(keyEvent("right"))).toBe(true)
    expect(readonly.logicalCursor.col).toBeGreaterThan(cursorBefore)
    expect(readonly.handleKeyPress(keyEvent("f5"))).toBe(true)
    await renderOnce()
    expect(readonly.lineCount).toBeLessThan(content.split("\n").length)
    expect(readonly.handleKeyPress(keyEvent("f6"))).toBe(true)
    await renderOnce()
    expect(readonly.plainText).toBe(content)

    readonly.value = '{\n  "updated": true\n}'
    await new Promise((resolve) => setTimeout(resolve, 10))
    await renderOnce()
    expect(readonly.plainText).toBe('{\n  "updated": true\n}')
  })

  it("keeps read-only mouse selections active while dragging below the viewport", async () => {
    let editor: CodeEditorRenderable | null = null
    const content = Array.from(
      { length: 20 },
      (_, index) => `line ${index}`,
    ).join("\n")
    const { renderer, renderOnce, mockMouse } = await testRender(
      <box width={24} height={4}>
        <code-editor
          ref={(renderable) => {
            editor = renderable
          }}
          filetype="json"
          theme={opencodeTheme}
          value={content}
          readOnly
          backgroundColor={opencodeTheme.backgroundPanel}
          focusedBackgroundColor={opencodeTheme.backgroundPanel}
          textColor={opencodeTheme.text}
          cursorColor={opencodeTheme.primary}
        />
      </box>,
      { width: 24, height: 8 },
    )
    await renderOnce()

    const readonly = editor!
    const x = readonly.x + 1
    const y = readonly.y
    await act(async () => {
      await mockMouse.pressDown(x, y, MouseButtons.LEFT)
      await mockMouse.moveTo(x, readonly.y + readonly.height + 2, {
        delayMs: 25,
      })
    })
    for (let frame = 0; frame < 4; frame++) {
      await new Promise((resolve) => setTimeout(resolve, 30))
      await renderOnce()
    }

    expect(readonly.scrollY).toBeGreaterThan(0)
    const selectedText = renderer.getSelection()?.getSelectedText() ?? ""
    expect(selectedText).toContain("ine 0")
    expect(selectedText).toContain("line 4")

    await mockMouse.release(x, readonly.y + readonly.height + 2)
    const scrollAfterRelease = readonly.scrollY
    await new Promise((resolve) => setTimeout(resolve, 50))
    await renderOnce()
    expect(readonly.scrollY).toBe(scrollAfterRelease)
  })

  it("keeps reverse mouse selections ordered while dragging above the viewport", async () => {
    let editor: CodeEditorRenderable | null = null
    const content = Array.from(
      { length: 20 },
      (_, index) => `line ${index}`,
    ).join("\n")
    const { renderer, renderOnce, mockMouse } = await testRender(
      <box
        width={24}
        height={8}
        style={{ flexDirection: "column" }}
        onMouseDrag={(event) => {
          editor?.handleSelectionDrag(event.x, event.y)
        }}
        onMouseUp={() => {
          editor?.finishSelectionDrag()
        }}
      >
        <box height={2} />
        <box height={4}>
          <code-editor
            ref={(renderable) => {
              editor = renderable
            }}
            flexGrow={1}
            filetype="json"
            theme={opencodeTheme}
            value={content}
            readOnly
            backgroundColor={opencodeTheme.backgroundPanel}
            focusedBackgroundColor={opencodeTheme.backgroundPanel}
            textColor={opencodeTheme.text}
            cursorColor={opencodeTheme.primary}
          />
        </box>
      </box>,
      { width: 24, height: 10 },
    )
    await renderOnce()

    const readonly = editor!
    readonly.scrollTo(readonly.totalVirtualLineCount)
    await renderOnce()
    const initialScrollY = readonly.scrollY
    const x = readonly.x + 1
    const y = readonly.y + readonly.height - 1
    await act(async () => {
      await mockMouse.pressDown(x, y, MouseButtons.LEFT)
      await mockMouse.moveTo(x, y - 1)
    })
    const anchor = readonly.getSelection()?.end
    await act(async () => {
      await mockMouse.moveTo(x, readonly.y - 1, { delayMs: 25 })
    })
    for (let frame = 0; frame < 5; frame++) {
      await new Promise((resolve) => setTimeout(resolve, 30))
      await renderOnce()
    }

    expect(readonly.scrollY).toBeLessThan(initialScrollY)
    const selection = readonly.getSelection()
    expect(selection?.start).toBeLessThan(selection?.end ?? 0)
    expect(selection?.end).toBe(anchor)
    const selectedText = renderer.getSelection()?.getSelectedText() ?? ""
    expect(selectedText).toContain("line 12")
    expect(selectedText).toContain("line 18")

    await mockMouse.release(x, readonly.y - 1)
    const scrollAfterRelease = readonly.scrollY
    await new Promise((resolve) => setTimeout(resolve, 50))
    await renderOnce()
    expect(readonly.scrollY).toBe(scrollAfterRelease)
  })

  it("limits JSON highlighting to visible lines and skips pathological lines", async () => {
    let editor: CodeEditorRenderable | null = null
    const content = [
      "{",
      ...Array.from({ length: 2_000 }, (_, i) => `  "item${i}": ${i},`),
      '  "last": true',
      "}",
    ].join("\n")
    const { renderOnce } = await testRender(
      <box width={48} height={8}>
        <code-editor
          ref={(renderable) => {
            editor = renderable
          }}
          filetype="json"
          theme={opencodeTheme}
          value={content}
          readOnly
          backgroundColor={opencodeTheme.backgroundPanel}
          focusedBackgroundColor={opencodeTheme.backgroundPanel}
          textColor={opencodeTheme.text}
          cursorColor={opencodeTheme.primary}
        />
      </box>,
      { width: 48, height: 8 },
    )
    await new Promise((resolve) => setTimeout(resolve, 10))
    await renderOnce()

    const readonly = editor!
    const initialHighlights = getHighlightCount(readonly)
    expect(initialHighlights).toBeGreaterThan(0)
    expect(initialHighlights).toBeLessThan(100)

    readonly.scrollTo(readonly.totalVirtualLineCount)
    await new Promise((resolve) => setTimeout(resolve, 10))
    await renderOnce()
    expect(getHighlightCount(readonly)).toBeGreaterThan(initialHighlights)

    readonly.value = `{ "payload": "${"x".repeat(100_001)}" }`
    await new Promise((resolve) => setTimeout(resolve, 10))
    await renderOnce()
    expect(getHighlightCount(readonly)).toBe(0)
  })
})
