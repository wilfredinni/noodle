import { afterAll, describe, expect, it } from "bun:test"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { load } from "js-yaml"
import { generateScriptDeclarations } from "../../src/scriptApiTypes"
import { SCRIPT_LIMITS, type ScriptPhase } from "../../src/preRequestScript"
import { createScriptSemanticChecker } from "../../src/ui/editor/scriptSemanticChecker"

const checker = createScriptSemanticChecker(
  {
    pre: generateScriptDeclarations("pre"),
    post: generateScriptDeclarations("post"),
    tests: generateScriptDeclarations("tests"),
  },
  SCRIPT_LIMITS.sourceBytes,
)
afterAll(() => checker.dispose())

describe("script semantic diagnostics", () => {
  it.each([
    ["missingValue", "pre", "Cannot find name"],
    ["noodle.run.missing()", "pre", "does not exist"],
    ['noodle["missing"]()', "pre", "unavailable"],
    [
      'const api = noodle.run; const key = "missing"; api[key]()',
      "pre",
      "unavailable",
    ],
    ['globalThis.fetch("x")', "pre", "unavailable"],
    ['const host = globalThis; host["process"].exit()', "pre", "unavailable"],
    ['noodle.request.headers.set(123, "x")', "pre", "not assignable"],
    ['noodle.request.headers.set("x")', "pre", "Expected 2 arguments"],
    ['noodle.request.url = "https://example.com"', "post", "read-only"],
    ['noodle.request.method = "POST"', "tests", "read-only"],
    ['noodle.request.headers.set("x", "y")', "post", "does not exist"],
    ["noodle.response.status", "pre", "does not exist"],
    ['noodle.run.set("x", 1)', "tests", "does not exist"],
    [
      'noodle.cookies.set({ name: "x", value: "y" })',
      "tests",
      "does not exist",
    ],
    ['test("ok", () => {})', "pre", "Cannot find name"],
    ["expect(1).toBe(1)", "post", "Cannot find name"],
    ['expect(1).toBeGreaterThan("1")', "tests", "not assignable"],
    ['expect([]).toHaveLength("1")', "tests", "not assignable"],
    ['expect(1).toBeTypeOf("integer")', "tests", "not assignable"],
    ["const alias = noodle.run; alias.missing()", "pre", "does not exist"],
    ["const { set } = noodle.run; set(1, true)", "pre", "not assignable"],
    ['/** @type {number} */ const value = "wrong"', "pre", "not assignable"],
    ["noodle.request.body.setJson(() => {})", "pre", "not assignable"],
  ] as [string, ScriptPhase, string][])(
    "checks %s in %s",
    (source, phase, message) => {
      expect(checker.check(source, phase).first?.message).toContain(message)
    },
  )

  it.each([
    ["const noodle = { run: { custom() {} } }; noodle.run.custom()", "pre"],
    ["const fetch = () => 1; fetch()", "pre"],
    ['const { set } = noodle.run; set("x", 1)', "pre"],
    [
      'const r = await noodle.runRequest("child"); console.log(r.json().id); return',
      "pre",
    ],
    [
      'const p = noodle.response.json(); noodle.run.set("id", p.id); console.info(p.name.toUpperCase())',
      "post",
    ],
    [
      'noodle.request.headers.set("x", noodle.run.get("x")); noodle.request.body.setJson({ ...noodle.request.body.json() })',
      "pre",
    ],
    [
      'const values = [...noodle.run.get("values")]; console.log(values, noodle.iteration.data.id)',
      "pre",
    ],
    [
      'test("ok", async () => { await Promise.resolve(); expect(noodle.response.status).not.toBe(500) })',
      "tests",
    ],
    [
      'expect("ok").toMatch(/ok/); expect({ a: 1 }).toMatchObject({ a: 1 }); expect(1).toBeTypeOf("number")',
      "tests",
    ],
    [
      'const map = new Map(); map.set("x", new Date().toISOString()); Array.from(new Set([1, 2])); JSON.parse("{}"); BigInt(1); new Float16Array(1); Iterator.from([1]); new InternalError("x")',
      "pre",
    ],
  ] as [string, ScriptPhase][])("accepts %s in %s", (source, phase) => {
    expect(checker.check(source, phase)).toEqual({ count: 0 })
  })

  it("reports source positions and counts without leaking another document's locals", () => {
    expect(checker.check("const local = 1; console.log(local)", "pre")).toEqual(
      { count: 0 },
    )
    const result = checker.check("// 🙂\nconsole.log(local, missing)", "pre")
    expect(result.count).toBe(2)
    expect(result.first).toMatchObject({ line: 2, column: 13 })
    expect(checker.check("missing", "pre").first).toMatchObject({
      line: 1,
      column: 1,
    })
    checker.clear()
    expect(checker.check("local", "pre").first?.message).toContain(
      "Cannot find name",
    )
  })

  it.each([
    "fetch",
    "process",
    "Bun",
    "require",
    "module",
    "exports",
    "setTimeout",
    "window",
    "document",
    "Intl",
    "Atomics",
  ])("does not expose the host global %s", (name) => {
    const result = checker.check(`${name}()`, "pre")
    expect(result.count).toBeGreaterThan(0)
    expect(result.first?.message).not.toMatch(
      /npm|@types|tsconfig|\/noodle|\/lib\./,
    )
  })

  it("rejects module loading and honors the source limit", () => {
    expect(
      checker.check('const name = "fs"; await import(name)', "pre").first
        ?.message,
    ).toContain("Module loading")
    expect(
      checker.check('await import("/etc/passwd")', "pre").first?.message,
    ).toContain("Module loading")
    expect(() =>
      checker.check(" ".repeat(SCRIPT_LIMITS.sourceBytes + 1), "pre"),
    ).toThrow("256 KiB")
  })

  it("accepts the maintained collection examples", async () => {
    const root = fileURLToPath(
      new URL("../../dev/collection/", import.meta.url),
    )
    for await (const path of new Bun.Glob("**/*.yml").scan(root)) {
      const data = load(await Bun.file(join(root, path)).text()) as {
        scripts?: { pre?: string; post?: string }
        tests?: string
      } | null
      if (!data) continue
      for (const phase of ["pre", "post", "tests"] as const) {
        let source = phase === "tests" ? data.tests : data.scripts?.[phase]
        if (typeof source !== "string" || !source) continue
        if (source.startsWith("./"))
          source = await Bun.file(join(root, source)).text()
        const result = checker.check(source, phase)
        expect({ path, phase, result }).toEqual({
          path,
          phase,
          result: { count: 0 },
        })
      }
    }
  })
})
