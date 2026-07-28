import { describe, expect, it } from "bun:test"
import {
  CodeEditorFoldManager,
  type CodeEditorFoldManagerHost,
} from "../../src/ui/editor/codeEditorFoldManager"

const source = `{
  "name": "noodle"
}`

function createManager(): {
  manager: CodeEditorFoldManager
  getDisplayedText: () => string
} {
  let displayedText = source
  let cursor = { line: 0, col: 0 }
  const host: CodeEditorFoldManagerHost = {
    getDisplayedText: () => displayedText,
    setDisplayedText: (text) => {
      displayedText = text
    },
    getCursor: () => cursor,
    setCursor: (line, col) => {
      cursor = { line, col }
    },
    withRenderSuppressed: (action) => action(),
    applyDisplayHighlights: () => {},
    scheduleHighlight: () => {},
    requestRender: () => {},
    onSourceTextChange: () => {},
    onFoldsChange: () => {},
  }
  const manager = new CodeEditorFoldManager(source, "json", true, host)
  return { manager, getDisplayedText: () => displayedText }
}

describe("CodeEditorFoldManager", () => {
  it("restores source display before clearing active folds", () => {
    const { manager, getDisplayedText } = createManager()
    manager.computeFoldRanges()
    manager.toggleFold(0)

    expect(getDisplayedText()).not.toBe(source)
    manager.clearFolds()

    expect(getDisplayedText()).toBe(source)
    expect(manager.isFoldedDisplay).toBe(false)
    expect(manager.getFolds()).toEqual(new Map())
  })

  it("recomputes fold signs after folding is re-enabled", () => {
    const { manager } = createManager()
    manager.computeFoldRanges()

    manager.setFoldable(false)
    expect(manager.getFolds()).toEqual(new Map())

    manager.setFoldable(true)
    expect(manager.getFoldSigns().get(0)?.before).toBe("▼")
  })
})
