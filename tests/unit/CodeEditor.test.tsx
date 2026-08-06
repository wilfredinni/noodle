import { describe, expect, it } from "bun:test"
import { testRender } from "@opentui/react/test-utils"
import { extend } from "@opentui/react"
import type { KeyEvent, LineNumberRenderable } from "@opentui/core"
import { CodeEditorRenderable } from "../../src/ui/editor/CodeEditor"
import { opencodeTheme } from "../../src/ui/theme-data"

extend({ "code-editor": CodeEditorRenderable })

describe("CodeEditorRenderable", () => {
  function keyEvent(
    name: string,
    modifiers: Partial<
      Pick<KeyEvent, "ctrl" | "meta" | "shift" | "option" | "super" | "hyper">
    > = {},
  ): KeyEvent {
    return {
      name,
      sequence: name,
      raw: name,
      ctrl: false,
      meta: false,
      shift: false,
      option: false,
      super: false,
      hyper: false,
      ...modifiers,
    } as KeyEvent
  }

  function computeFolds(editor: CodeEditorRenderable): void {
    ;(
      editor as unknown as { computeFoldRanges: () => void }
    ).computeFoldRanges()
  }

  function getHighlightCount(editor: CodeEditorRenderable): number {
    let count = 0
    for (let line = 0; line < editor.lineCount; line++) {
      count += editor.getLineHighlights(line).length
    }
    return count
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
    editor!.handleKeyPress({
      name: "1",
      sequence: "1",
      raw: "1",
      ctrl: false,
      meta: false,
      shift: false,
      option: false,
      super: false,
      hyper: false,
    } as KeyEvent)
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
