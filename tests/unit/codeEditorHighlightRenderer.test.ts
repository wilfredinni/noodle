import { describe, expect, it } from "bun:test"
import type { SyntaxStyle, TreeSitterClient } from "@opentui/core"
import { opencodeTheme } from "../../src/ui/theme-data"
import { CodeEditorHighlightRenderer } from "../../src/ui/editor/codeEditorHighlightRenderer"
import type { EditorHighlightRange } from "../../src/ui/editor/codeEditorHighlighting"

function createHost() {
  let style: SyntaxStyle | undefined
  const ranges: EditorHighlightRange[] = []

  return {
    host: {
      clear: () => {
        ranges.length = 0
      },
      setStyle: (next: SyntaxStyle) => {
        style = next
      },
      applyRanges: (next: EditorHighlightRange[]) => {
        ranges.push(...next)
      },
    },
    ranges,
    getStyle: () => style,
  }
}

describe("CodeEditorHighlightRenderer", () => {
  it("applies the syntax style for XML Tree-sitter highlights", async () => {
    const { host, ranges, getStyle } = createHost()
    const renderer = new CodeEditorHighlightRenderer(
      opencodeTheme,
      undefined,
      host,
    )
    const client = {
      highlightOnce: async () => ({
        highlights: [
          [0, 1, "punctuation.delimiter"],
          [1, 5, "tag"],
        ],
      }),
    } as unknown as TreeSitterClient

    await renderer.highlight("<note>", "xml", client, () => true)

    const style = getStyle()!
    expect(style).toBeDefined()
    expect(ranges).toEqual([
      {
        start: 0,
        end: 1,
        styleId: style.getStyleId("punctuation.delimiter") ?? 0,
        priority: 1,
      },
      {
        start: 1,
        end: 5,
        styleId: style.getStyleId("tag") ?? 0,
        priority: 1,
      },
    ])
  })

  it("uses Tree-sitter highlights for JSON", async () => {
    const { host, ranges, getStyle } = createHost()
    const renderer = new CodeEditorHighlightRenderer(
      opencodeTheme,
      undefined,
      host,
    )
    const calls: Array<[string, string]> = []
    const client = {
      highlightOnce: async (content: string, filetype: string) => {
        calls.push([content, filetype])
        return {
          highlights: [
            [0, 1, "punctuation.bracket"],
            [4, 10, "property"],
            [12, 19, "string"],
          ],
        }
      },
    } as unknown as TreeSitterClient

    await renderer.highlight(
      '{\n  "name": "hello"\n}',
      "json",
      client,
      () => true,
    )

    const style = getStyle()!
    expect(calls).toEqual([['{\n  "name": "hello"\n}', "json"]])
    expect(ranges.slice(-3)).toEqual([
      {
        start: 0,
        end: 1,
        styleId: style.getStyleId("punctuation.bracket") ?? 0,
        priority: 1,
      },
      {
        start: 3,
        end: 9,
        styleId: style.getStyleId("property") ?? 0,
        priority: 1,
      },
      {
        start: 11,
        end: 18,
        styleId: style.getStyleId("string") ?? 0,
        priority: 1,
      },
    ])
  })

  it("keeps display offsets correct in JSON fallback highlights", async () => {
    const { host, ranges, getStyle } = createHost()
    const renderer = new CodeEditorHighlightRenderer(
      opencodeTheme,
      undefined,
      host,
    )
    const content = '{\n  "emoji": "hello 😊"\n}'
    const client = {
      highlightOnce: async () => {
        throw new Error("parser unavailable")
      },
    } as unknown as TreeSitterClient

    await renderer.highlight(content, "json", client, () => true)

    const stringStyleId = getStyle()!.getStyleId("json.string") ?? 0
    const stringRange = ranges.find(
      (range) => range.styleId === stringStyleId && range.start === 12,
    )

    expect(stringRange).toEqual({
      start: 12,
      end: 21,
      styleId: stringStyleId,
      priority: 1,
    })
  })

  it("keeps JSON fallback highlights when Tree-sitter returns partial output", async () => {
    const { host, ranges, getStyle } = createHost()
    const renderer = new CodeEditorHighlightRenderer(
      opencodeTheme,
      undefined,
      host,
    )
    const client = {
      highlightOnce: async () => ({
        highlights: [[0, 1, "punctuation.bracket"]],
      }),
    } as unknown as TreeSitterClient

    await renderer.highlight(
      '{\r\n  "name": "María 😊',
      "json",
      client,
      () => true,
    )

    expect(ranges).toContainEqual({
      start: 11,
      end: 19,
      styleId: getStyle()!.getStyleId("json.string") ?? 0,
      priority: 1,
    })
  })

  it("keeps YAML fallback highlights when Tree-sitter returns partial output", async () => {
    const { host, ranges, getStyle } = createHost()
    const renderer = new CodeEditorHighlightRenderer(
      opencodeTheme,
      undefined,
      host,
    )
    const client = {
      highlightOnce: async () => ({
        highlights: [[0, 5, "property"]],
      }),
    } as unknown as TreeSitterClient

    await renderer.highlight(
      'name: "María 😊\r\nnext: true',
      "yaml",
      client,
      () => true,
    )

    expect(ranges).toContainEqual({
      start: 6,
      end: 14,
      styleId: getStyle()!.getStyleId("yaml.text") ?? 0,
      priority: 1,
    })
  })
})
