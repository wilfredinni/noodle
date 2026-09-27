import { describe, expect, it } from "bun:test"
import {
  buildFoldDisplay,
  buildSourceDisplayMaps,
  computeFoldRanges,
  hasFoldedRanges,
  isSourceLineHiddenByFold,
} from "../../src/ui/editor/codeEditorFolds"

describe("codeEditorFolds", () => {
  it("folds nested JavaScript blocks and arrays without reading literal brackets", () => {
    const content = [
      'test("response", () => {',
      '  const text = "}";',
      "  const pattern = /[}\\]]/;",
      "  // } ]",
      "  const template = `raw } ${`nested ]`} text`;",
      "  const values = [",
      "    { value: 1 },",
      "    { value: 2 },",
      "  ];",
      "  if (values.length) {",
      "    console.log(text, pattern, template);",
      "  }",
      "});",
      "/* comment {",
      "   still a comment ]",
      "*/",
    ].join("\n")
    const folds = computeFoldRanges(content, "javascript", new Map())
    expect([...folds.keys()]).toEqual([5, 9, 0, 13])
    expect(folds.get(0)).toMatchObject({ endLine: 12, folded: false })
    expect(folds.get(5)).toMatchObject({ endLine: 8 })
    expect(folds.get(9)).toMatchObject({ endLine: 11 })
    expect(folds.get(13)).toMatchObject({ endLine: 15 })
    folds.get(5)!.folded = true
    expect(computeFoldRanges(content, "javascript", folds).get(5)?.folded).toBe(
      true,
    )
    expect(buildFoldDisplay(content, folds).text).not.toContain("{ value: 2 }")
  })

  it("does not fold incomplete JavaScript blocks or multiline template text as code", () => {
    const content =
      "const text = `raw {\nraw }`;\nif (true) {\n  console.log(text);"
    expect(computeFoldRanges(content, "javascript", new Map()).size).toBe(0)
    const nested = computeFoldRanges(
      "if (true) {\n  if (false) {\n  }\n",
      "javascript",
      new Map(),
    )
    expect([...nested.keys()]).toEqual([1])
  })

  it.each([
    "function request(\n  url,\n  options\n) {\n  return url;\n}",
    "if (\n  ready &&\n  enabled\n) {\n  run();\n}",
  ])(
    "folds multiline JavaScript headers independently of their bodies: %s",
    (content) => {
      const folds = computeFoldRanges(content, "javascript", new Map())
      expect(folds.get(0)).toMatchObject({ endLine: 3 })
      expect(folds.get(3)).toMatchObject({ endLine: 5 })
    },
  )

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
