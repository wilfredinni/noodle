import { afterAll, describe, expect, it } from "bun:test"
import { createScriptSemanticChecker } from "../../src/ui/editor/scriptSemanticChecker"
import { generateScriptDeclarations } from "../../src/scriptApiTypes"
import {
  SCRIPT_API_CONTRACT,
  SCRIPT_LIMITS,
  runPreRequestScript,
  type ScriptPhase,
} from "../../src/preRequestScript"
import {
  scriptEnvironmentKeys,
  type ScriptCompletionContext,
} from "../../src/ui/editor/scriptCompletion"
import { RunScope } from "../../src/runScope"

const checker = createScriptSemanticChecker(
  {
    pre: generateScriptDeclarations("pre"),
    post: generateScriptDeclarations("post"),
    tests: generateScriptDeclarations("tests"),
  },
  SCRIPT_LIMITS.sourceBytes,
)
afterAll(() => checker.dispose())
const context = {
  environmentKeys: ["TOKEN", "BASE_URL"],
  requestIds: ["auth/login", "users/list"],
}
function assist(
  marked: string,
  phase: ScriptPhase = "pre",
  names: ScriptCompletionContext = context,
  explicit = true,
) {
  const cursor = marked.indexOf("|")
  return checker.assist(marked.replace("|", ""), phase, cursor, names, explicit)
}
const labels = (marked: string, phase: ScriptPhase = "pre") =>
  assist(marked, phase).items.map((item) => item.label)

describe("script language assistance", () => {
  it("covers every catalog entry in all allowed phases", () => {
    for (const phase of ["pre", "post", "tests"] as const) {
      for (const entry of SCRIPT_API_CONTRACT) {
        const full = entry.member
          ? `${entry.global}.${entry.member}`
          : entry.global
        const parent =
          entry.global === "expect" && entry.member
            ? "expect(1)."
            : full.includes(".")
              ? full.slice(0, full.lastIndexOf(".") + 1)
              : full.slice(0, 1)
        const label = entry.member
          ? entry.member.split(".").at(-1)!
          : entry.global
        const found = labels(`${parent}|`, phase).includes(label)
        expect({ phase, full, found }).toEqual({
          phase,
          full,
          found: entry.phases.includes(phase),
        })
      }
    }
  })
  it.each([
    ["JSON.|", "parse"],
    ["Math.|", "floor"],
    ["new Date().|", "toISOString"],
    ['const token = "x"; token.|', "toUpperCase"],
    ["const xs = [1]; xs.|", "map"],
    ['const obj = {name: "Ada"}; obj.|', "name"],
    ["const run = noodle.run; run.|", "set"],
    ['const response = await noodle.runRequest("child"); response.|', "status"],
    ["noodle.iteration?.|", "index"],
    ["noodle.sendRequest({ | })", "url"],
    ["noodle.random.number({ | })", "min"],
    ['noodle.crypto.sha256("x", "|")', "hex"],
    ["`value: ${noodle.run.|}`", "get"],
    ["resp|", "noodle.response"],
    [
      "/** @type {{id: number}} */ const json = noodle.response.json(); json.|",
      "id",
    ],
  ])("completes %s", (source, expected) => {
    expect(labels(source, "post")).toContain(expected)
  })

  it("handles multiline matchers, shadows, and exact-name dismissal", () => {
    expect(labels("expect(\n  1\n).not.|", "tests")).toContain("toBe")
    expect(labels("const noodle = { custom: true }; noodle.|")).toEqual([
      "custom",
    ])
    expect(
      labels("const noodle = { custom: true }; resp|", "post"),
    ).not.toContain("noodle.response")
    expect(assist("noodle.run.set|", "pre", context, false).items).toEqual([])
    expect(labels("noodle.run.set|")).toContain("set")
    for (const source of [
      "// noodle.|",
      "/* noodle.|",
      '"noodle.|"',
      "`noodle.|`",
    ])
      expect(labels(source)).toEqual([])
  })
  it("provides signature help and selected-entry documentation", () => {
    expect(assist('noodle.crypto.sha256("x", |)').signatureHelp).toMatchObject({
      prefix: "sha256(",
      activeParameter: 1,
    })
    expect(
      assist('noodle.run.set("x", Math.max(1, |))').signatureHelp,
    ).toMatchObject({ prefix: "max(", activeParameter: 0 })
    const text = "noodle.run.se"
    expect(checker.details(text, "pre", text.length, "set")).toMatchObject({
      description: expect.stringContaining("persisting"),
      signature: expect.stringContaining("persist"),
    })
    expect(assist('noodle.run.set("x", 1)|').signatureHelp).toBeUndefined()
  })
  it("suggests collection names for API declarations and aliases only", () => {
    for (const source of [
      'noodle.env.get("|")',
      'noodle.run.get("|")',
      'noodle.run.set("|", 1)',
      'noodle.run.unset("|")',
      'const api = noodle.env; api.get("|")',
      'const { get } = noodle.env; get("|")',
    ])
      expect(labels(source)).toEqual(context.environmentKeys)
    expect(labels('const { runRequest: run } = noodle; run("|")')).toEqual(
      context.requestIds,
    )
    expect(labels('noodle.runRequest("auth/|")')).toEqual(["auth/login"])
    for (const source of [
      'const noodle = { env: { get(name) {} } }; noodle.env.get("|")',
      'const get = (name) => {}; get("|")',
      'noodle.run.set("name", "|")',
    ])
      expect(labels(source)).not.toContain("TOKEN")
    expect(labels('noodle.runRequest("|")', "tests")).not.toContain(
      "auth/login",
    )
    expect(
      assist('noodle.env.get("|")', "pre", {
        environmentKeys: ["NEW"],
        requestIds: [],
      }).items.map((x) => x.label),
    ).toEqual(["NEW"])
    expect(
      assist('noodle.runRequest("|")', "pre", {
        environmentKeys: [],
        requestIds: [],
      }).items,
    ).toEqual([])
    expect(checker.check('noodle.env.get("CUSTOM")', "pre")).toEqual({
      count: 0,
    })
  })
  it("escapes inserted names and replaces only the intended source span", async () => {
    for (const quote of ['"', "'"]) {
      const source = `noodle.runRequest(${quote}a|tail${quote})`
      const names = { environmentKeys: [], requestIds: ['a"b\\c', "a'b"] }
      const result = assist(source, "pre", names)
      for (const item of result.items) {
        const plain = source.replace("|", "")
        const applied =
          plain.slice(0, item.start) + item.insert + plain.slice(item.end)
        expect(applied).toStartWith(`noodle.runRequest(${quote}`)
        expect(applied).toEndWith(`${quote})`)
        const literal = applied.slice("noodle.runRequest(".length, -1)
        const scope = new RunScope()
        const execution = await runPreRequestScript(
          `noodle.run.set("value", ${literal})`,
          {
            id: "x",
            name: "x",
            method: "GET",
            url: "https://example.com",
            headers: {},
            params: [],
            timeout: 0,
          },
          undefined,
          scope,
        )
        expect(execution.result.success).toBe(true)
        expect(scope.get("value")).toBe(item.label)
      }
    }
    const middle = assist('noodle.cry|ypto.randomBytes(1, "hex")').items.find(
      (x) => x.label === "crypto",
    )!
    expect(middle).toMatchObject({ start: 7, end: 14, insert: "crypto" })
  })
  it("passes only enabled names, including missing secrets", () => {
    const keys = scriptEnvironmentKeys({
      name: "dev",
      vars: { PUBLIC: "value", SECRET: "sensitive" },
      secretVars: { SECRET: "keychain", MISSING: "missing", OFF: "disabled" },
      disabledVars: { OFF: "hidden", DISABLED: "hidden" },
    })
    expect(keys).toEqual(["MISSING", "PUBLIC", "SECRET"])
    const result = assist('noodle.env.get("|")', "pre", {
      environmentKeys: keys,
      requestIds: [],
    })
    expect(JSON.stringify(result)).not.toMatch(/sensitive|hidden/)
  })
  it("matches newly included native APIs to QuickJS and excludes unavailable APIs", async () => {
    const expressions = [
      "Object.groupBy",
      "Map.groupBy",
      "Promise.withResolvers",
      "Promise.try",
      "Set.prototype.union",
      "RegExp.escape",
      "String.prototype.isWellFormed",
      "ArrayBuffer.prototype.resize",
      "SharedArrayBuffer.prototype.grow",
      "Iterator.from",
      "Iterator.concat",
      "Math.sumPrecise",
      "Error.isError",
      "Set.groupBy",
      "Map.prototype.getOrInsert",
      "WeakMap.prototype.getOrInsertComputed",
    ]
    const scope = new RunScope()
    const result = await runPreRequestScript(
      `noodle.run.set("supported", [${expressions.map((x) => `typeof ${x}`).join(",")}]);
      noodle.run.set("nativeResults", {
        unicodeSets: new RegExp("", "v").unicodeSets,
        sum: Math.sumPrecise([1e20, 1, -1e20]),
        concatenated: [...Iterator.concat([1], [2])],
        grouped: Set.groupBy([1, 2, 1], value => value).get(1),
      })`,
      {
        id: "x",
        name: "x",
        method: "GET",
        url: "https://example.com",
        headers: {},
        params: [],
        timeout: 0,
      },
      undefined,
      scope,
    )
    expect(result.result.success).toBe(true)
    expect(scope.get("supported")).toEqual(expressions.map(() => "function"))
    expect(scope.get("nativeResults")).toEqual({
      unicodeSets: true,
      sum: 1,
      concatenated: [1, 2],
      grouped: [1, 1],
    })
    expect(checker.check(expressions.join(";"), "pre")).toEqual({ count: 0 })
    const globals = labels("|")
    for (const name of [
      "fetch",
      "Bun",
      "process",
      "require",
      "window",
      "document",
      "faker",
      "ajv",
      "Intl",
      "Atomics",
      "as",
      "import",
      "export",
      "using",
      "satisfies",
    ])
      expect(globals).not.toContain(name)
    expect(labels("Array.|")).not.toContain("fromAsync")
    expect(labels("Uint8Array.|")).not.toContain("fromBase64")
    expect(labels("new RegExp('').|")).toContain("unicodeSets")
  })
})
