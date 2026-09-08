import { describe, expect, it } from "bun:test"
import {
  parseVisualBody,
  visualChildren,
  visualMatches,
  visualSummary,
  type VisualNode,
} from "../../src/ui/responseVisual"

function parse(body: string): VisualNode {
  const parsed = parseVisualBody(body)
  if (parsed.kind !== "success") throw new Error(parsed.message)
  return parsed.root
}

describe("response visualization data", () => {
  it("preserves JSON types, unusual keys, empty values, and exact number literals", () => {
    const root = parse(
      '{"id":9007199254740993123,"n":null,"empty":"","array":[],"object":{},"bool":false,"__proto__":{"ok":1}}',
    )
    expect(
      root.children.map((child) => [child.label, visualSummary(child)]),
    ).toEqual([
      ["id", "9007199254740993123"],
      ["n", "null"],
      ["empty", '""'],
      ["array", "[]"],
      ["object", "{}"],
      ["bool", "false"],
      ["__proto__", "{1 fields}"],
    ])
    for (const body of ['"hello"', "0", "false", "null", "1e1000"])
      expect(visualSummary(parse(body))).toBe(body)
  })

  it("keeps complete matching records and filters nested lists without discarding metadata", () => {
    const root = parse(
      JSON.stringify({
        total: 2,
        records: [
          {
            id: 1,
            name: "Alice",
            nested: [{ city: "Santiago" }, { city: "Paris" }],
          },
          { id: 2, name: "Bob" },
        ],
      }),
    )
    const matches = visualMatches(root, "SANTIAGO")
    expect(visualChildren(root, "SANTIAGO", matches)).toHaveLength(2)
    const records = root.children[1]!
    const matching = visualChildren(records, "SANTIAGO", matches)
    expect(matching).toHaveLength(1)
    expect(matching[0]!.children.map((node) => node.label)).toEqual([
      "id",
      "name",
      "nested",
    ])
    expect(
      visualChildren(matching[0]!.children[2]!, "SANTIAGO", matches),
    ).toHaveLength(1)
    expect(visualMatches(root, "absent").size).toBe(0)
    expect(visualChildren(records, "", new Set())).toHaveLength(2)
    expect(
      visualChildren(records, "records", visualMatches(root, "records")),
    ).toHaveLength(2)
  })

  it("searches literal punctuation, Unicode, long values, and mixed arrays", () => {
    const root = parse(
      JSON.stringify([
        { value: "a".repeat(10000) + "🦑.[]" },
        42,
        null,
        ["café"],
      ]),
    )
    for (const query of ["🦑.[]", "42", "null", "CAFÉ"])
      expect(
        visualChildren(root, query, visualMatches(root, query)),
      ).toHaveLength(1)
  })

  it("traverses deeply nested objects and large lists without recursive tree walkers", () => {
    const depth = 500
    const root = parse(
      '{"child":'.repeat(depth) + '"needle"' + "}".repeat(depth),
    )
    expect(visualMatches(root, "needle").size).toBe(depth + 1)
    const list = parse(
      JSON.stringify(Array.from({ length: 20000 }, (_, id) => ({ id }))),
    )
    expect(list.children).toHaveLength(20000)
    expect(
      visualChildren(list, "19999", visualMatches(list, "19999")),
    ).toHaveLength(1)
  })

  it("preserves XML attributes, namespaces, repeated elements, and text values", () => {
    const document = parse(
      '<r xmlns:p="urn:p"><p:item id="01"><name>A &amp; B</name></p:item><p:item id="02"><name>C</name></p:item></r>',
    )
    const root = document.children[0]!
    expect(root.children[0]!.label).toBe("@xmlns:p")
    const records = root.children[1]!
    expect(records.kind).toBe("array")
    expect(records.label).toBe("p:item")
    expect(records.children.map((child) => child.children[0]!.value)).toEqual([
      "01",
      "02",
    ])
    expect(visualSummary(records.children[0]!.children[1]!)).toBe("A & B")
  })

  it("preserves XML mixed content order, CDATA, comments, and processing instructions", () => {
    const root = parse(
      '<?xml version="1.0"?><p>Hello <b>world</b>!<![CDATA[<raw>]]><!--note--><?target data?></p>',
    )
    expect(root.children[0]!.label).toBe("?xml")
    expect(
      root.children[1]!.children.map((child) => [
        child.label,
        visualSummary(child),
      ]),
    ).toEqual([
      ["#text", "Hello "],
      ["b", "world"],
      ["#text", "!"],
      ["#cdata", "<raw>"],
      ["#comment", "note"],
      ["?target", "data"],
    ])
  })

  it("honors inherited xml:space without merging across preserved whitespace", () => {
    const root = parse(
      '<r xml:space="preserve"><items> <item/> <item/> </items></r>',
    )
    const items = root.children[0]!.children[1]!
    expect(items.children.map((child) => child.label)).toEqual([
      "#text",
      "item",
      "#text",
      "item",
      "#text",
    ])
  })

  it("reports empty, malformed, unsupported, and DTD-dependent documents", () => {
    expect(parseVisualBody(" ").kind).toBe("empty")
    for (const body of [
      "hello",
      "{bad}",
      "<a><b></a>",
      "<a>&unknown;</a>",
      '<!DOCTYPE a SYSTEM "file:///etc/passwd"><a/>',
      '<!DOCTYPE a [<!ENTITY test "value">]><a>&test;</a>',
    ]) {
      const parsed = parseVisualBody(body)
      expect(parsed.kind).toBe("error")
      if (parsed.kind === "error") expect(parsed.message).toContain("Source")
    }
  })
})
