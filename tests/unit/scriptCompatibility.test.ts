import { expect, it } from "bun:test"
import { scriptCompatibility } from "../../src/converters/scriptCompatibility"

it("accepts literal Noodle APIs and lexical locals without rewriting JavaScript", () => {
  for (const source of [
    'const stamp = String(Date.now()); noodle.request.headers.set("X-Time", stamp)',
    'const body = noodle.request.body.json(); body.name = "Ada"; noodle.request.body.setJson(body)',
    'const {id: value = 1} = {id: 2}; noodle.run.set("id", value)',
    "const pm = {value: 1}; console.log(pm.value)",
    "function f({x}) { return x }; console.log(f({x: 1}))",
    '// pm.fake()\nconsole.log("require and insomnia are just text")',
  ])
    expect(scriptCompatibility(source, "pre")).toEqual({
      compatible: true,
      unsupportedGlobals: [],
    })
  expect(
    scriptCompatibility(
      'test("ok", () => expect(noodle.response.status).toBe(200))',
      "tests",
    ).compatible,
  ).toBe(true)
})

it("rejects free foreign globals, syntax, indirect access, modules and ambiguous APIs", () => {
  for (const source of [
    'pm.environment.set("token", "secret")',
    'postman.setEnvironmentVariable("x", 1)',
    'require("package")',
    "const x = {pm}",
    "typeof pm",
    "function f() { const pm = 1; }; console.log(pm)",
    'console.log(`${insomnia.environment.get("x")}`)',
    'context.request.setHeader("x", "y")',
  ]) {
    const result = scriptCompatibility(source, "pre")
    expect(result.compatible).toBe(false)
    expect(result.unsupportedGlobals.length).toBeGreaterThan(0)
    expect(JSON.stringify(result)).not.toContain("secret")
  }
  for (const source of [
    "const broken = ;",
    'import x from "package"',
    'import("package")',
    "export const x = 1",
    "export function f() {}",
    "this.pm()",
    'globalThis["pm"]()',
    'eval("1")',
    'Function("return 1")',
    'const n = noodle; n.env.set("x", "y")',
    'noodle.env.set("x", "y")',
    'noodle["env"]["set"]("x", "y")',
    'noodle["en" + "v"].get("x")',
    '(() => {}).constructor("return this")()',
    'const {"constructor": F} = () => {}; F("return pm")()',
    'let F; ({constructor: F} = () => {}); F("return pm")()',
    'let constructor; ({constructor} = () => {}); constructor("return pm")()',
    "with ({}) {}",
    'await noodle.runRequest("child")',
    "Promise.resolve(1)",
  ])
    expect(scriptCompatibility(source, "pre").compatible).toBe(false)
  expect(
    scriptCompatibility('noodle.request.headers.set("x", "y")', "post")
      .compatible,
  ).toBe(false)
  expect(
    scriptCompatibility('test("x", () => {})', "pre").unsupportedGlobals,
  ).toEqual(["test"])
  expect(
    scriptCompatibility('pm.x(); require("x"); pm.y(); insomnia.x()', "pre")
      .unsupportedGlobals,
  ).toEqual(["insomnia", "pm", "require"])
})

it("rejects read-only writes, invalid matcher placement, and parser exhaustion", () => {
  for (const source of [
    'noodle.request.url = "http://127.0.0.1"',
    "noodle.response.status++",
    "delete noodle.env.get",
  ])
    expect(scriptCompatibility(source, "post").compatible).toBe(false)
  expect(
    scriptCompatibility('noodle.request.url = "http://127.0.0.1"', "pre")
      .compatible,
  ).toBe(true)
  expect(scriptCompatibility("expect(1).not.toBe(2)", "tests").compatible).toBe(
    true,
  )
  for (const source of [
    "expect(1).unknown()",
    "expect.toBe(1)",
    "export const x = 1",
    "(".repeat(20000) + "1" + ")".repeat(20000),
  ])
    expect(scriptCompatibility(source, "tests").compatible).toBe(false)
})

it("compiles accepted source against Noodle's exact QuickJS wrapper without executing it", () => {
  for (const source of [
    "break",
    "continue",
    "yield 1",
    "let await = 1",
    "let value = 1; let value = 2",
  ])
    expect(scriptCompatibility(source, "pre")).toMatchObject({
      compatible: false,
      reason: "syntax",
    })
  expect(scriptCompatibility("while (true) {}", "pre").compatible).toBe(true)
  expect(
    scriptCompatibility('throw Error("must not run")', "pre").compatible,
  ).toBe(true)
})
