import { afterAll, describe, expect, it } from "bun:test"
import {
  applyCodeEdits,
  formatCodeFields,
  formatJsonCode,
  formattedOffset,
} from "../../src/ui/editor/codeFormatting"
import { createScriptDiagnostics } from "../../src/ui/editor/scriptDiagnostics"

const service = createScriptDiagnostics()
afterAll(() => service.dispose())

describe("code formatting", () => {
  it("preserves JSON numbers, duplicate keys, escapes, and unevaluated templates", () => {
    const source =
      '{"id":90071992547409931234,"id":1e999,"n":-0,"v":$VALUE,"random":$random.number.int({"min":1,"max":3}),"time":$time.iso(),"s":"$VALUE $$ \\u0041"}'
    const edits = formatJsonCode(source)!
    const result = applyCodeEdits(source, edits)
    expect(result).toContain('\n  "id": 90071992547409931234,')
    expect(result).toContain('"id": 1e999')
    expect(result).toContain('"n": -0')
    expect(result).toContain('"v": $VALUE')
    expect(result).toContain('$random.number.int({"min":1,"max":3})')
    expect(result).toContain("$time.iso()")
    expect(result).toContain('"$VALUE $$ \\u0041"')
    expect(formatJsonCode(result)).toEqual([])
    expect(
      result.slice(formattedOffset(source.indexOf("$VALUE"), edits)),
    ).toStartWith("$VALUE")
  })

  it.each([
    '{"a":}',
    '{"a":1,}',
    '{/*comment*/"a":1}',
    '{"v":$random.number.int(}',
    '{"v":$$VALUE}',
  ])("leaves invalid JSON unchanged: %s", (source) => {
    expect(formatJsonCode(source)).toBeNull()
  })

  it("formats every script phase without evaluating code or changing strings and comments", async () => {
    for (const phase of ["pre", "post", "tests"] as const) {
      const source =
        '// hello\nconst x={a:1};\nconsole.log("  hello  ");\nawait Promise.resolve(x);\nreturn x'
      const result = applyCodeEdits(
        source,
        (await service.format(source, phase))!,
      )
      expect(result).toContain("const x = { a: 1 };")
      expect(result).toContain("// hello\n")
      expect(result).toContain('"  hello  "')
      expect(result).toContain("return x")
      expect(await service.format(result, phase)).toEqual([])
      expect(await service.format("const x = {", phase)).toBeNull()
      expect(
        (await service.check("missingName()", phase)).count,
      ).toBeGreaterThan(0)
    }
  })

  it("does not supersede concurrent formatting requests", async () => {
    const sources = ["const a=1", "const b=2", "const c=3"]
    const edits = await Promise.all(
      sources.map((source) => service.format(source, "pre")),
    )
    expect(edits.map((edit, i) => applyCodeEdits(sources[i]!, edit!))).toEqual([
      "const a = 1",
      "const b = 2",
      "const c = 3",
    ])
  })

  it("formats saved fields while preserving external sources, invalid code, and XML", async () => {
    const source = {
      bodyType: "json" as const,
      body: '{"x":$X}',
      scripts: { pre: "./scripts/pre.js", post: "const p={ok:true}" },
      tests: 'test("ok",()=>{expect(1).toBe(1)})',
    }
    const { fields } = await formatCodeFields(source, service)
    expect(fields.scripts!.pre).toBe(source.scripts.pre)
    expect(fields.scripts!.post).toBe("const p = { ok: true }")
    expect(fields.tests).toContain("() => { expect(1).toBe(1) }")
    expect(fields.body).toBe('{\n  "x": $X\n}')
    const xml = {
      bodyType: "xml" as const,
      body: "<p> a <b>b</b> c </p>",
      tests: "test(",
    }
    expect((await formatCodeFields(xml, service)).fields).toEqual(xml)
  })

  it("preserves a failed script while formatting the remaining saved fields", async () => {
    const source = {
      body: '{"x":1}',
      scripts: { pre: "unavailable()", post: "const p=1" },
      tests: "./tests.js",
    }
    const result = await formatCodeFields(source, {
      format: async (text, phase) => {
        if (phase === "pre") throw new Error("Semantic validation unavailable")
        return service.format(text, phase)
      },
    })
    expect(result.fields).toEqual({
      body: '{\n  "x": 1\n}',
      scripts: { pre: source.scripts.pre, post: "const p = 1" },
      tests: source.tests,
    })
    expect(result.edits.pre).toBeUndefined()
    expect(result.edits.post).toBeDefined()
    expect(result.failed).toBe(true)
  })
})
