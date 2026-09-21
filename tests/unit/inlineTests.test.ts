import { describe, expect, it } from "bun:test"
import { lang } from "../../src/lang"
import {
  runRequestScript,
  SCRIPT_API_CONTRACT,
  SCRIPT_LIMITS,
  TEST_MATCHERS,
  scriptWasmMemoryForTests,
} from "../../src/preRequestScript"
import { RunScope } from "../../src/runScope"
import type { SubstitutedRequest } from "../../src/requests/substitute"
import type { Response } from "../../src/schema"

const request: SubstitutedRequest = {
  id: "test",
  name: "Test",
  method: "GET",
  url: "http://127.0.0.1/test",
  headers: { "X-Prepared": "yes" },
  params: [],
  timeout: 0,
}
const response: Response = {
  status: 200,
  statusText: "OK",
  headers: { "Content-Type": "application/json" },
  body: '{"status":"active","items":[1,{"id":2}],"nil":null}',
  timeMs: 12,
}
const run = (source: string, scope = new RunScope(), body = response.body) =>
  runRequestScript(
    "tests",
    source,
    request,
    { name: "dev", vars: { VALUE: "env" } },
    scope,
    { response: { ...response, body } },
  )

const cases = [
  ["toBe", "NaN", "NaN", "1"],
  [
    "toEqual",
    '{a: [1, null, {b: true}], c: "x"}',
    '{c: "x", a: [1, null, {b: true}]}',
    '{a: ["1", null, {b: true}], c: "x"}',
  ],
  ["toBeTruthy", '"x"', "", ""],
  ["toBeFalsy", "0", "", ""],
  ["toBeDefined", "null", "", ""],
  ["toBeNull", "null", "", ""],
  ["toContain", '"active user"', '"user"', '"missing"'],
  ["toMatch", '"Active"', '"^Active$"', '"^active$"'],
  ["toBeGreaterThan", "3", "2", "3"],
  ["toBeGreaterThanOrEqual", "3", "3", "4"],
  ["toBeLessThan", "3", "4", "3"],
  ["toBeLessThanOrEqual", "3", "3", "2"],
] as const

describe("inline test schema", () => {
  const prefix = "name: Test\nmethod: GET\nurl: http://127.0.0.1/\n"
  it("strictly parses tests and rejects external source without reading files", () => {
    for (const value of ["null", "1", "false", "[]", "{}"])
      expect(() =>
        lang.parseRequest("x", `${prefix}tests: ${value}\n`),
      ).toThrow("tests must be a string")
    for (const path of [
      "./test.js",
      "../tests",
      "/tmp/test",
      "file:///tmp/test.js",
      "@/test.ts",
      "C:\\tests\\a.js",
    ])
      expect(() =>
        lang.parseRequest("x", `${prefix}tests: '${path}'\n`),
      ).toThrow("external test files are not supported")
    expect(lang.parseRequest("x", prefix)).not.toHaveProperty("tests")
    expect(lang.serializeRequest(lang.parseRequest("x", prefix))).not.toContain(
      "tests:",
    )
  })
  it("canonically round-trips literal whitespace, empty source, comments and regex", () => {
    for (const source of [
      "",
      " \n\n",
      "  test('x', () => {})\n\n",
      '// $UNCHANGED\nconst pattern = /a+/i;\ntest("x", () => {})',
      "/abc/",
    ]) {
      const original = { ...lang.parseRequest("x", prefix), tests: source }
      const yaml = lang.serializeRequest(original)
      expect(yaml).toContain("tests: |2")
      expect(lang.parseRequest("x", yaml).tests).toBe(source)
      expect(lang.serializeRequest(lang.parseRequest("x", yaml))).toBe(yaml)
    }
  })
})

describe("inline test sandbox", () => {
  it("supports every matcher and its negation with both passing and failing outcomes", async () => {
    expect(cases.map(([name]) => name)).toEqual([...TEST_MATCHERS])
    const opposite: Record<string, string> = {
      toBeTruthy: "0",
      toBeFalsy: "1",
      toBeDefined: "undefined",
      toBeNull: "undefined",
    }
    for (const [name, actual, expected, different] of cases) {
      const negativeActual = opposite[name] ?? actual
      const negativeExpected = different
      const result = await run(`
        test("pass", () => expect(${actual}).${name}(${expected}));
        test("not pass", () => expect(${negativeActual}).not.${name}(${negativeExpected}));
        test("fail", () => expect(${negativeActual}).${name}(${negativeExpected}));
        test("not fail", () => expect(${actual}).not.${name}(${expected}));
      `)
      expect(result.result.error).toBeUndefined()
      expect(result.tests?.map((test) => test.passed)).toEqual([
        true,
        true,
        false,
        false,
      ])
      expect(
        result.tests?.every(
          (test) => Number.isFinite(test.durationMs) && test.durationMs >= 0,
        ),
      ).toBe(true)
    }
  })
  it("preserves Object.is identity, signed zero, JSON null and undefined", async () => {
    const result = await run(`
      test("identity", () => {
        const object = {a: 1}; expect(object).toBe(object); expect(object).not.toBe({a: 1});
        expect(NaN).toBe(NaN); expect(Infinity).toBe(Infinity); expect(-0).not.toBe(0);
        expect(undefined).toBe(undefined); expect(undefined).not.toBeDefined();
        expect(null).toBeDefined(); expect(null).toBeNull();
        expect(noodle.response.json().nil).toBeNull();
        expect(noodle.response.json().missing).not.toBeDefined();
        expect(Object.assign(Object.create(null), {a: 1})).toEqual({a: 1});
        expect([1, 2]).not.toEqual([2, 1]); expect([1]).not.toEqual({0: 1});
        expect({a: -0}).not.toEqual({a: 0});
      });
    `)
    expect(result.tests?.[0]?.passed).toBe(true)
    expect(
      (
        await run(
          'test("null",()=>expect(noodle.response.json()).toBeNull())',
          undefined,
          "null",
        )
      ).tests?.[0]?.passed,
    ).toBe(true)
  })
  it("supports deep array containment and regex flags without mutating lastIndex", async () => {
    const result = await run(`test("patterns", () => {
      expect([{a: [1, 2]}, null]).toContain({a: [1, 2]});
      expect([1]).not.toContain("1");
      const re = /active/gi; re.lastIndex = 100;
      expect("ACTIVE").toMatch(re); expect("ACTIVE").toMatch(re); expect(re.lastIndex).toBe(100);
      expect("a\\nb").toMatch(/^b/m); expect("AA").toMatch("A+");
      expect("ACTIVE").not.toMatch("active");
    })`)
    expect(result.tests?.[0]?.passed).toBe(true)
  })
  it("fails invalid matcher values even when negated and continues", async () => {
    const expressions = [
      "expect(1).not.toContain(1)",
      'expect("a").not.toContain(1)',
      'expect("a").not.toMatch("[")',
      'expect(1).not.toMatch("1")',
      'expect("a").not.toMatch({})',
      "expect(undefined).toEqual(undefined)",
      "expect({a: undefined}).not.toEqual({})",
      ...[
        "toBeGreaterThan",
        "toBeGreaterThanOrEqual",
        "toBeLessThan",
        "toBeLessThanOrEqual",
      ].flatMap((name) => [
        `expect("1").not.${name}(2)`,
        `expect(1).${name}(Infinity)`,
        `expect(NaN).${name}(1)`,
      ]),
    ]
    const result = await run(
      expressions
        .map((source, i) => `test("bad ${i}", () => {${source}});`)
        .join("\n") + 'test("last", () => expect(true).toBeTruthy());',
    )
    expect(result.result.error).toBeUndefined()
    expect(
      result.tests
        ?.slice(0, -1)
        .every((test) => !test.passed && test.message.length > 0),
    ).toBe(true)
    expect(result.tests?.at(-1)?.passed).toBe(true)
  })
  it("preserves duplicate declaration order and completed tests before top-level errors", async () => {
    const result = await run(
      'test("same",()=>expect(1).toBe(2)); test("same",()=>{throw Error("callback")}); test("same",()=>{});\nthrow Error("top level")',
    )
    expect(result.tests?.map(({ name, passed }) => [name, passed])).toEqual([
      ["same", false],
      ["same", false],
      ["same", true],
    ])
    expect(result.tests?.[1]?.message).toBe("callback")
    expect(result.result.error).toMatchObject({
      name: "ScriptRuntimeError",
      message: "top level",
      line: 2,
    })
    expect(JSON.stringify(result)).not.toContain("quickjs")
    expect(result.result.error).not.toHaveProperty("stack")
  })
  it("validates declarations and treats empty source as evaluated with zero tests", async () => {
    for (const source of [
      'test("",()=>{})',
      'test("  ",()=>{})',
      "test(1,()=>{})",
      'test("x", 1)',
    ]) {
      const result = await run(`test("before",()=>{}); ${source}`)
      expect(result.result.success).toBe(false)
      expect(result.tests?.length).toBe(1)
      expect(result.result.error?.name).toBe("ScriptApiValidationError")
    }
    for (const source of ["", " \n", "const x = 1;"]) {
      const result = await run(source)
      expect(result.result.success).toBe(true)
      expect(result.tests).toEqual([])
    }
    expect((await run("./tests.js")).result.error?.message).toContain(
      "external script paths are not supported",
    )
  })
  it("rejects native Promises and thenables without running asynchronous jobs", async () => {
    const result = await run(`
      test("promise", () => Promise.resolve(1));
      test("thenable", () => ({then() { console.log("never"); }}));
      test("hidden promise", () => Object.setPrototypeOf(Promise.resolve(1), null));
      test("getter", () => ({get then() { throw Error("then getter failed"); }}));
      test("async", async () => { await 1; console.log("never"); });
      test("after", () => expect(2).toBe(2));
    `)
    expect(result.tests?.slice(0, 3).map((test) => test.message)).toEqual(
      Array(3).fill("async tests are not supported"),
    )
    expect(result.tests?.[3]?.message).toBe("then getter failed")
    expect(result.tests?.[4]?.message).toBe("async tests are not supported")
    expect(result.tests?.at(-1)?.passed).toBe(true)
    expect(result.result.logs).toEqual([])
    expect(result.result.error?.name).toBe("ScriptAsyncUnsupportedError")
    const queued = await run(
      'Promise.resolve().then(()=>console.log("never")); test("sync",()=>{})',
    )
    expect(queued.result.error?.name).toBe("ScriptAsyncUnsupportedError")
    expect(queued.result.logs).toEqual([])
  })
  it("exposes the test contract and applicable existing helpers only in tests", async () => {
    const result = await run(`test("contract", () => {
      expect(Object.keys(expect(1))).toEqual(${JSON.stringify([...TEST_MATCHERS, "not"])});
      expect(Object.isFrozen(expect(1))).toBe(true); expect(Object.getPrototypeOf(expect(1))).toBeNull();
      expect(typeof request).toBe("undefined"); expect(typeof response).toBe("undefined");
      expect(noodle.request.headers.get("x-prepared")).toBe("yes");
      expect(noodle.response.status).toBe(200); expect(noodle.response.headers.get("missing")).toBeNull();
      expect(noodle.env.get("VALUE")).toBe("env"); expect(noodle.run.get("missing")).not.toBeDefined();
      expect(noodle.crypto.sha256("x", "hex")).toBeDefined();
      noodle.random.seed(1); expect(noodle.random.number()).toBeDefined();
      expect(noodle.time.now()).toBeGreaterThan(0);
    })`)
    expect(result.result.error).toBeUndefined()
    expect(result.tests?.[0]?.passed).toBe(true)
    expect(
      SCRIPT_API_CONTRACT.filter((entry) => entry.global === "test")[0]?.phases,
    ).toEqual(["tests"])
    for (const phase of ["pre", "post"] as const) {
      const old = await runRequestScript(
        phase,
        'if (typeof test !== "undefined" || typeof expect !== "undefined") throw Error("test globals leaked")',
        request,
        undefined,
        new RunScope(),
        { response },
      )
      expect(old.result.success).toBe(true)
    }
  })
  it("rejects every existing state mutator and keeps response JSON immutable", async () => {
    const scope = new RunScope()
    scope.set("key", { nested: [1] })
    const mutators = [
      'noodle.request.url = "http://127.0.0.1/changed"',
      'noodle.request.method = "POST"',
      'noodle.request.headers.set("x", "y")',
      'noodle.request.headers.delete("x")',
      'noodle.request.params.set("x", "y")',
      'noodle.request.params.append("x", "y")',
      'noodle.request.params.delete("x")',
      'noodle.request.body.setText("x")',
      "noodle.request.body.setJson({})",
      "noodle.request.body.clear()",
      'noodle.request.auth.setBearer("x")',
      'noodle.request.auth.setBasic("x", "y")',
      'noodle.request.auth.setApiKey("x", "y", "header")',
      "noodle.request.auth.clear()",
      'noodle.run.set("key", "changed")',
      'noodle.run.unset("key")',
      'noodle.run.set("key", "changed", {persist: "environment"})',
      "noodle.response.status = 201",
    ]
    const result = await run(
      mutators
        .map((source, i) => `test("mutation ${i}",()=>{${source}});`)
        .join("\n") +
        '\ntest("frozen",()=>{ "use strict"; noodle.response.json().items[1].id = 3; });\ntest("intact",()=>expect(noodle.response.json().items[1].id).toBe(2));',
      scope,
    )
    expect(
      result.tests
        ?.slice(0, mutators.length)
        .every(
          (test) => !test.passed && test.message.includes("read-only in tests"),
        ),
    ).toBe(true)
    expect(result.tests?.at(-2)?.passed).toBe(false)
    expect(result.tests?.at(-1)?.passed).toBe(true)
    expect(scope.get("key")).toEqual({ nested: [1] })
    expect(result.persistenceIntents).toBeUndefined()
  })
  it("rejects hostile values and remains isolated from prototype tampering", async () => {
    const values = [
      "(()=>{const v={};v.self=v;return v})()",
      "Object.create({bad:1})",
      '({["__proto__"]: {polluted:true}})',
      "({constructor: 1})",
      '({get a(){throw Error("getter executed")}})',
      "new Date()",
      "new Map()",
      "(()=>{})",
      'Symbol("x")',
      "1n",
      "[,1]",
      "[undefined]",
      "Object.assign([], {extra: 1})",
      '({[Symbol("key")]:1})',
      '"x".repeat(270000)',
      "(()=>{let v={};for(let i=0;i<40;i++)v={v};return v})()",
    ]
    const result = await run(
      values
        .map(
          (value, i) =>
            `test("hostile ${i}",()=>expect(${value}).not.toBeNull());`,
        )
        .join("\n") +
        `
      test("intrinsics",()=>{
        Object.is = () => false; Object.keys = () => []; JSON.stringify = () => "wrong"; JSON.parse = () => ({});
        Object.getPrototypeOf = () => null; Set.prototype.has = () => false;
        expect(NaN).toBe(NaN); expect({a:[1]}).toEqual({a:[1]});
      });
      test("still rejects",()=>expect({constructor:1}).toBeTruthy());
    `,
    )
    expect(
      result.tests
        ?.slice(0, values.length)
        .every(
          (test) => !test.passed && !test.message.includes("getter executed"),
        ),
    ).toBe(true)
    expect(result.tests?.at(-2)?.passed).toBe(true)
    expect(result.tests?.at(-1)?.passed).toBe(false)
    expect({}).not.toHaveProperty("polluted")
  })
  it("bounds result retention and keeps prior results after timeout or memory exhaustion", async () => {
    const before = scriptWasmMemoryForTests().buffer.byteLength
    for (const source of [
      'test("limit",()=>{while(true){}})',
      'test("regex",()=>expect("a".repeat(100000)+"!").toMatch("(a+)+$"))',
      'test("limit",()=>{const values=[];while(true)values.push(new Array(10000).fill("abcdefgh"))})',
      'for(let i=0;i<10000;i++) test("x".repeat(1000),()=>{})',
    ]) {
      const scope = new RunScope()
      scope.rememberSecrets(["memory", "stack", "interrupted"])
      const result = await run(
        'test("before",()=>{});' + source + ';test("never",()=>{})',
        scope,
      )
      expect(result.result.success).toBe(false)
      expect(result.tests?.[0]?.name).toBe("before")
      expect(result.tests?.some(({ name }) => name === "never")).toBe(false)
      expect(JSON.stringify(result.tests).length).toBeLessThan(
        SCRIPT_LIMITS.bridgeValueBytes + 10000,
      )
      expect(result.result.error?.name).toMatch(
        /Script(?:Timeout|MemoryLimit|ApiValidation)Error/,
      )
      expect(
        (await run('test("recovered",()=>expect(1).toBe(1))')).tests?.[0]
          ?.passed,
      ).toBe(true)
    }
    expect(scriptWasmMemoryForTests().buffer.byteLength).toBe(before)
  })
  it("does not retain partial log entries when the console byte budget runs out", async () => {
    const result = await run(
      'console.log("p".repeat(65530)); console.log("boundary-secret"); test("after",()=>{})',
    )
    expect(result.result.logs).toEqual([
      { level: "log", message: "p".repeat(65530) },
    ])
    expect(result.tests?.[0]?.passed).toBe(true)
  })
})
