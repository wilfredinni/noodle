import { expect, it } from "bun:test"
import { scriptCompatibility } from "../../src/converters/scriptCompatibility"

it("leaves Promise-returning request helpers unconverted, including callback result access", async () => {
  for (const phase of ["pre", "post"] as const)
    for (const source of [
      'noodle.runRequest("id").then(r => r.response.json())',
      'noodle.runRequest("id").then(r => r.json())',
      'const pending = noodle.runRequest("id"); pending.then(r => r.response.json())',
      'noodle.sendRequest({url: "http://127.0.0.1"}).then(r => r.response.json())',
    ])
      expect(await scriptCompatibility(source, phase)).toEqual({
        compatible: false,
        unsupportedGlobals: [],
        reason: "unverifiable",
      })
})

it("initializes QuickJS only when a script needs compile-only validation", async () => {
  const child = Bun.spawn(
    [
      process.execPath,
      "-e",
      `
      let initializations = 0;
      const instantiate = WebAssembly.instantiate;
      WebAssembly.instantiate = (...args) => {
        initializations++;
        return instantiate(...args);
      };
      const { postmanImporter } = await import("./src/converters/postman");
      const { insomniaImporter } = await import("./src/converters/insomnia");
      await postmanImporter.import(JSON.stringify({info: {name: "Empty"}, item: []}));
      await insomniaImporter.import(JSON.stringify({_type: "export", __export_format: 4,
        resources: [{_type: "workspace", _id: "w", name: "Empty"}]}));
      if (initializations !== 0) throw Error("script-free import initialized QuickJS");
      const { scriptCompatibility } = await import("./src/converters/scriptCompatibility");
      await scriptCompatibility("pm.sendRequest()", "pre");
      if (initializations !== 0) throw Error("unsupported source initialized QuickJS");
      if (!(await scriptCompatibility("console.log(1)", "pre")).compatible) throw Error("valid source rejected");
      if (initializations !== 1) throw Error("validator did not initialize once");
      await scriptCompatibility("console.log(2)", "pre");
      if (initializations !== 1) throw Error("validator initialized twice");
    `,
    ],
    {
      cwd: new URL("../../", import.meta.url).pathname,
      stdout: "pipe",
      stderr: "pipe",
    },
  )
  const [stderr, code] = await Promise.all([
    new Response(child.stderr).text(),
    child.exited,
  ])
  expect(stderr).toBe("")
  expect(code).toBe(0)
})

it("accepts literal Noodle APIs and lexical locals without rewriting JavaScript", async () => {
  for (const source of [
    'const stamp = String(Date.now()); noodle.request.headers.set("X-Time", stamp)',
    'const body = noodle.request.body.json(); body.name = "Ada"; noodle.request.body.setJson(body)',
    'const {id: value = 1} = {id: 2}; noodle.run.set("id", value)',
    "const pm = {value: 1}; console.log(pm.value)",
    "function f({x}) { return x }; console.log(f({x: 1}))",
    '// pm.fake()\nconsole.log("require and insomnia are just text")',
  ])
    expect(await scriptCompatibility(source, "pre")).toEqual({
      compatible: true,
      unsupportedGlobals: [],
    })
  expect(
    (
      await scriptCompatibility(
        'test("ok", () => expect(noodle.response.status).toBe(200))',
        "tests",
      )
    ).compatible,
  ).toBe(true)
})

it("rejects free foreign globals, syntax, indirect access, modules and ambiguous APIs", async () => {
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
    const result = await scriptCompatibility(source, "pre")
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
    expect((await scriptCompatibility(source, "pre")).compatible).toBe(false)
  expect(
    (await scriptCompatibility('noodle.request.headers.set("x", "y")', "post"))
      .compatible,
  ).toBe(false)
  expect(
    (await scriptCompatibility('test("x", () => {})', "pre"))
      .unsupportedGlobals,
  ).toEqual(["test"])
  expect(
    (
      await scriptCompatibility(
        'pm.x(); require("x"); pm.y(); insomnia.x()',
        "pre",
      )
    ).unsupportedGlobals,
  ).toEqual(["insomnia", "pm", "require"])
})

it("rejects read-only writes, invalid matcher placement, and parser exhaustion", async () => {
  for (const source of [
    'noodle.request.url = "http://127.0.0.1"',
    "noodle.response.status++",
    "delete noodle.env.get",
  ])
    expect((await scriptCompatibility(source, "post")).compatible).toBe(false)
  expect(
    (
      await scriptCompatibility(
        'noodle.request.url = "http://127.0.0.1"',
        "pre",
      )
    ).compatible,
  ).toBe(true)
  expect(
    (await scriptCompatibility("expect(1).not.toBe(2)", "tests")).compatible,
  ).toBe(true)
  for (const source of [
    "expect(1).unknown()",
    "expect.toBe(1)",
    "export const x = 1",
    "(".repeat(20000) + "1" + ")".repeat(20000),
  ])
    expect((await scriptCompatibility(source, "tests")).compatible).toBe(false)
})

it("compiles accepted source against Noodle's exact QuickJS wrapper without executing it", async () => {
  for (const source of [
    "break",
    "continue",
    "yield 1",
    "let await = 1",
    "let value = 1; let value = 2",
  ])
    expect(await scriptCompatibility(source, "pre")).toMatchObject({
      compatible: false,
      reason: "syntax",
    })
  expect((await scriptCompatibility("while (true) {}", "pre")).compatible).toBe(
    true,
  )
  expect(
    (await scriptCompatibility('throw Error("must not run")', "pre"))
      .compatible,
  ).toBe(true)
})
