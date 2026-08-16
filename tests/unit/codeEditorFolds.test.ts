import { describe, expect, it } from "bun:test"
import {
  buildFoldDisplay,
  buildSourceDisplayMaps,
  computeFoldRanges,
  hasFoldedRanges,
  isSourceLineHiddenByFold,
} from "../../src/ui/editor/codeEditorFolds"

describe("codeEditorFolds", () => {
  it("keeps nested JSON folds ordered by closing bracket", () => {
    const content = `{
  "outer": {
    "inner": true
  },
  "after": false
}`

    const folds = computeFoldRanges(content, "json", new Map())

    expect(Array.from(folds.keys())).toEqual([1, 0])
    expect(folds.get(1)).toMatchObject({ endLine: 3, folded: false })
    expect(folds.get(0)).toMatchObject({ endLine: 5, folded: false })
  })

  it("projects folded source into summary rows with reversible line maps", () => {
    const content = `name: demo
headers:
  accept: application/json
  enabled: true
body_type: json`
    const folds = computeFoldRanges(content, "yaml", new Map())
    const headers = folds.get(1)
    if (!headers) throw new Error("Expected headers fold")
    headers.folded = true

    const display = buildFoldDisplay(content, folds)

    expect(hasFoldedRanges(folds)).toBe(true)
    expect(display.text).toBe("name: demo\nheaders:\nbody_type: json")
    expect(display.sourceLineToDisplayLine.get(1)).toBe(1)
    expect(display.displayLineToSourceLine.get(2)).toBe(4)
    expect(isSourceLineHiddenByFold(2, folds)).toBe(true)
    expect(isSourceLineHiddenByFold(1, folds)).toBe(false)
  })

  it("folds multiline XML elements, comments, and CDATA", () => {
    const content = `<root>
  <!--
    note
  -->
  <value>
    text
  </value>
  <![CDATA[
    raw
  ]]>
</root>`
    const folds = computeFoldRanges(content, "xml", new Map())

    expect(folds.get(0)).toMatchObject({ endLine: 10, startOffset: 0 })
    expect(folds.get(1)?.summary).toContain("<!-- ... -->")
    expect(folds.get(4)?.summary).toContain("<value>...</value>")
    expect(folds.get(7)?.summary).toContain("<![CDATA[ ... ]]>")
  })

  it("builds identity maps for source display", () => {
    const maps = buildSourceDisplayMaps("one\ntwo\nthree")

    expect(Array.from(maps.sourceLineToDisplayLine.entries())).toEqual([
      [0, 0],
      [1, 1],
      [2, 2],
    ])
    expect(Array.from(maps.displayLineToSourceLine.entries())).toEqual([
      [0, 0],
      [1, 1],
      [2, 2],
    ])
  })
})
