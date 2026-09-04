import { describe, expect, it } from "bun:test"
import {
  replaceVariableReferences,
  variableReferences,
} from "../src/variableReference"

describe("variable references", () => {
  it("scans only unescaped $WORD references", () => {
    expect(
      variableReferences("$one $$two $$$three $ four").map(
        ({ name, start, end }) => ({ name, start, end }),
      ),
    ).toEqual([
      { name: "one", start: 0, end: 4 },
      { name: "three", start: 13, end: 19 },
    ])
  })

  it("resolves references once and turns $$ into a literal dollar", () => {
    const values: Record<string, string> = {
      NAME: "$OTHER",
      OTHER: "resolved",
    }
    expect(
      replaceVariableReferences(
        "$NAME|$$NAME|$$$OTHER|$",
        (name) => values[name]!,
      ),
    ).toBe("$OTHER|$NAME|$resolved|$")
  })
})
