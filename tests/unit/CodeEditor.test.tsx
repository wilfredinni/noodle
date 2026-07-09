import { describe, expect, it } from "bun:test"
import { testRender } from "@opentui/react/test-utils"
import { extend } from "@opentui/react"
import type { LineNumberRenderable } from "@opentui/core"
import { CodeEditorRenderable } from "../../src/ui/CodeEditor"
import { opencodeTheme } from "../../src/ui/theme-data"

extend({ "code-editor": CodeEditorRenderable })

describe("CodeEditorRenderable", () => {
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
})
