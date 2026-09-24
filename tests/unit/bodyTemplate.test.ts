import { afterEach, describe, expect, it, setSystemTime, spyOn } from "bun:test"
import {
  createBodyValueResolver,
  previewBodyValue,
  scanBodyTemplate,
  substituteBodyTemplate,
} from "../../src/bodyTemplate"
import { substitute } from "../../src/requests/substitute"
import { bodyForSend } from "../../src/requests/send"
import { validateJsonContent } from "../../src/ui/editor/jsonValidation"
import type { Request } from "../../src/schema"

const request = (overrides: Partial<Request> = {}): Request => ({
  id: "random",
  name: "Random",
  method: "POST",
  url: "https://example.com",
  headers: {},
  params: [],
  timeout: 0,
  ...overrides,
})
const env = { name: "test", vars: { random: "literal", value: "$random.uuid" } }
const expand = (
  source: string,
  json = false,
  vars: Record<string, string> = {},
) =>
  substituteBodyTemplate(
    source,
    json,
    (name) => {
      if (!Object.hasOwn(vars, name)) throw new Error(`missing ${name}`)
      return vars[name]!
    },
    createBodyValueResolver(() => {}),
  )

describe("request body templates", () => {
  afterEach(() => setSystemTime())

  it("shares one current timestamp across a body and refreshes it for the next execution", () => {
    const now = Date.parse("2026-01-01T00:00:00.123Z")
    setSystemTime(now)
    const resolve = createBodyValueResolver(() => {})
    setSystemTime(now + 1000)
    const source =
      '{"ms":$time.now,"also":$time.now(),"seconds":$time.unix,"iso":$time.iso(),"text":"$time.now"}'
    const body = substituteBodyTemplate(source, true, () => "", resolve)
    expect(JSON.parse(body)).toEqual({
      ms: now,
      also: now,
      seconds: Math.floor(now / 1000),
      iso: "2026-01-01T00:00:00.123Z",
      text: String(now),
    })
    expect(expand("$time.now")).toBe(String(now + 1000))
  })

  it("supports every time method with literal JSON arguments and normal JSON escaping", () => {
    const source = `{
      "parsed": $time.parse("2024-02-29"),
      "fromUnix": $time.fromUnix(1.5),
      "unix": $time.unix(-1),
      "iso": $time.iso(0),
      "formatted": $time.format("2026-01-01", "YYYY-MM-DD HH:mm Z", {"timeZone":"Asia/Kathmandu"}),
      "add": $time.add(0, 1.5, "seconds"),
      "subtract": $time.subtract(0, 1, "days"),
      "diff": $time.diff(1500, 0, "seconds"),
      "large": 9007199254740993123456
    }`
    const result = expand(source, true)
    expect(JSON.parse(result)).toMatchObject({
      parsed: Date.parse("2024-02-29"),
      fromUnix: 1500,
      unix: -1,
      iso: "1970-01-01T00:00:00.000Z",
      formatted: "2026-01-01 05:45 +05:45",
      add: 1500,
      subtract: -86400000,
      diff: 1.5,
    })
    expect(result).toContain("9007199254740993123456")
    const quoted = JSON.stringify({
      label: 'date-$time.format(0, "YYYY-MM-DD")',
    })
    expect(JSON.parse(expand(quoted, true))).toEqual({
      label: "date-1970-01-01",
    })
  })

  it("keeps time namespaces, escapes, generated text and argument strings single-pass", () => {
    expect(
      expand('$$time.now $time $value $random.pick(["$time.now"])', false, {
        time: "env",
        value: "$time.now",
      }),
    ).toBe("$time.now env $time.now $time.now")
    expect(expand('$time.format(0, "[$time.now]")')).toBe("$time.now")
    expect(() =>
      expand('$time.parse("$date")', false, { date: "2026-01-01" }),
    ).toThrow("expected an ISO date")
  })

  it.each([
    "$time.",
    "$time.missing",
    "$time.now(1)",
    "$time.fromUnix",
    "$time.parse()",
    "$time.iso(null)",
    "$time.fromUnix(1e999)",
    "$time.fromUnix(8640000000001)",
    '$time.parse("2026-02-30")',
    '$time.parse("2026-01-01T12:00:00")',
    '$time.add(0, 1, "months")',
    '$time.format(0, "YYYY", {"timeZone":"not/a/zone"})',
    '$time.format(0, "YYYY", {"unknown":true})',
    '$time.format(0, "YY")',
    '$time.format(0, "YYYY", {"__proto__":{}})',
    "$time.unix(Date.now())",
    "$time.iso($time.now)",
    "$time.fromUnix(1 + 2)",
    "$time.parse('2026-01-01')",
    "$time.iso(0,)",
    "$time.now.constructor()",
    "$time.iso(0",
  ])("rejects invalid time calls safely: %s", (source) => {
    expect(() => expand(source)).toThrow(/time\..* at line 1, column 1/)
    expect(
      validateJsonContent(`{"value":${source}}`, null, true),
    ).not.toBeNull()
  })

  it("validates time without reading the clock and preserves templates outside execution", () => {
    const body =
      '{"now":$time.now,"iso":$time.iso,"format":$time.format(0,"YYYY")}'
    const clock = spyOn(Date, "now")
    try {
      expect(validateJsonContent(body, null, true)).toBeNull()
      expect(
        JSON.parse(
          substituteBodyTemplate(body, true, () => "", previewBodyValue),
        ),
      ).toEqual({
        now: 0,
        iso: "1970-01-01T00:00:00.000Z",
        format: "1970",
      })
      expect(substitute(request({ bodyType: "json", body }), env).body).toBe(
        body,
      )
      expect(clock).not.toHaveBeenCalled()
    } finally {
      clock.mockRestore()
    }
    expect(() => expand('line\n$time.parse("secret-argument")')).toThrow(
      "time.parse: expected an ISO date or timestamp with a timezone at line 2, column 1",
    )
    expect(() => expand(`$time.parse("${"x".repeat(256 * 1024)}")`)).toThrow(
      "size limit",
    )
    expect(() =>
      expand(`$time.iso(${"[".repeat(33)}0${"]".repeat(33)})`),
    ).toThrow("JSON depth exceeds 32")
  })

  it("resolves time in XML and text form values while excluding disabled fields and file paths", async () => {
    expect(expand("<date>$time.iso(0)</date>")).toBe(
      "<date>1970-01-01T00:00:00.000Z</date>",
    )
    const result = substitute(
      request({
        url: "https://example.com/$time.iso",
        bodyType: "urlencoded",
        headers: { time: { enabled: true, value: "$time.iso" } },
        formData: [
          {
            name: "$time.iso",
            value: "$time.iso(0)",
            type: "text",
            enabled: true,
          },
          { name: "off", value: "$time.invalid", type: "text", enabled: false },
        ],
      }),
      { name: "", vars: { time: "literal" } },
      true,
      createBodyValueResolver(() => {}),
    )
    expect(result.url).toEndWith("/literal.iso")
    expect(result.headers.time).toBe("literal.iso")
    expect(result.formData?.[1]?.value).toBe("$time.invalid")
    expect(await bodyForSend(result, new Headers())).toBe(
      "literal.iso=1970-01-01T00%3A00%3A00.000Z",
    )
    const files = substitute(
      request({
        bodyType: "multipart",
        formData: [
          { name: "file", value: "$time.now", type: "file", enabled: true },
          {
            name: "text",
            value: "$time.fromUnix(1)",
            type: "text",
            enabled: true,
          },
        ],
      }),
      { name: "", vars: { time: "literal" } },
      true,
      createBodyValueResolver(() => {}),
    )
    expect(files.formData?.map((entry) => entry.value)).toEqual([
      "literal.now",
      "1000",
    ])
  })

  it("generates each occurrence, accepts both default spellings and preserves types and number source", () => {
    const body = expand(
      `{
      "id": "$random.uuid", "second": "$random.uuid()",
      "age": $random.number({"min":18,"max":18}),
      "active": $random.boolean, "role": $random.pick(["admin"]),
      "object": $random.pick([{"nested":[true,null]}]),
      "large": 9007199254740993123456
    }`,
      true,
    )
    const parsed = JSON.parse(body)
    expect(parsed.id).toMatch(/^[\da-f-]{36}$/)
    expect(parsed.second).not.toBe(parsed.id)
    expect(parsed.age).toBe(18)
    expect(typeof parsed.active).toBe("boolean")
    expect(parsed.role).toBe("admin")
    expect(parsed.object).toEqual({ nested: [true, null] })
    expect(body).toContain('"large": 9007199254740993123456')
  })

  it("escapes quoted values and decodes normally escaped JSON arguments", () => {
    const chosen = 'quote " slash \\ newline\n$literal 🙂'
    const expression = `$random.pick(${JSON.stringify([chosen])})`
    const body = JSON.stringify({
      text: `prefix-${expression}-suffix`,
      object: '$random.pick([{"a":1}])',
    })
    expect(JSON.parse(expand(body, true))).toEqual({
      text: `prefix-${chosen}-suffix`,
      object: '{"a":1}',
    })
    expect(expand('{"text":"$random.pick([\\u0022ok\\u0022])"}', true)).toBe(
      '{"text":"ok"}',
    )
  })

  it("preserves dollar escapes, environment names, literal arguments and single-pass values", () => {
    expect(
      expand(
        '$$random.uuid $random $$$random.pick(["$value"]) $value',
        false,
        env.vars,
      ),
    ).toBe("$random.uuid literal $$value $random.uuid")
    expect(expand('$random.pick(["$random.uuid()", "$random.uuid()"] )')).toBe(
      "$random.uuid()",
    )
    expect(expand('$random.pick(["a)\\\"b", "a)\\\"b"])')).toBe('a)"b')
  })

  it.each([
    "$random.",
    "$random.missing",
    "$random.seed(42)",
    "$random.uuid(1)",
    "$random.pick",
    "$random.pick([])",
    '$random.number({"min":2,"max":1})',
    '$random.number({"unknown":1})',
    "$random.number({min:1})",
    "$random.pick(['x'])",
    '$random.pick(["x",])',
    "$random.number(1 + 2)",
    "$random.pick([$random.uuid()])",
    "$random.uuid.constructor()",
    "$random.pick([1]",
    '$random.pick([{"__proto__":1}])',
    "$random.pick([1e999])",
  ])("rejects invalid calls before generation: %s", (source) => {
    expect(() => expand(source)).toThrow(/random\..* at line 1, column 1/)
  })

  it("reports safe locations without including arguments", () => {
    expect(() =>
      expand('line\n$random.number({"min":"secret-argument"})'),
    ).toThrow(
      "random.number: options must contain finite numbers at line 2, column 1",
    )
    expect(() => expand("$random.pick([secret-argument])")).toThrow(
      "arguments must be JSON literals",
    )
  })

  it("keeps argument size and depth limits", () => {
    expect(() => expand(`$random.pick(["${"x".repeat(256 * 1024)}"])`)).toThrow(
      "size limit",
    )
    expect(() =>
      expand(`$random.pick([${"[".repeat(33)}0${"]".repeat(33)}])`),
    ).toThrow("JSON depth exceeds 32")
  })

  it("does not generate during preview and validation", () => {
    const body =
      '{"id":"$random.uuid","age":$random.number,"choice":$random.pick([true])}'
    const preview = substituteBodyTemplate(
      body,
      true,
      () => "",
      previewBodyValue,
    )
    expect(JSON.parse(preview)).toEqual({ id: "example", age: 0, choice: true })
    expect(validateJsonContent(body, null, true)).toBeNull()
    expect(
      validateJsonContent('{"id":"$random.uuid(1)"}', null, true),
    ).toContain("does not accept arguments")
    expect(validateJsonContent('{"age":$random.number,}', null, true)).toBe(
      "Invalid JSON: Expected a property name at line 1, column 23",
    )
    expect(substitute(request({ bodyType: "json", body }), env).body).toBe(body)
    expect(
      substitute(
        request({ body }),
        env,
        false,
        createBodyValueResolver(() => {
          throw new Error("generated")
        }),
      ).body,
    ).toBe(body)
  })

  it("handles literal text, XML and encoded forms while excluding names and file paths", async () => {
    const resolve = createBodyValueResolver(() => {})
    expect(expand('<value>$random.pick(["<&>"])</value>')).toBe(
      "<value><&></value>",
    )
    expect(expand('object=$random.pick([{"x":1}])')).toBe('object={"x":1}')
    const result = substitute(
      request({
        url: "https://example.com/$random.uuid",
        bodyType: "urlencoded",
        headers: { test: { value: "$random.uuid", enabled: true } },
        formData: [
          {
            name: "$random.uuid",
            value: '$random.pick(["a&b"] )',
            enabled: true,
            type: "text",
          },
          {
            name: "off",
            value: "$random.missing",
            enabled: false,
            type: "text",
          },
        ],
      }),
      env,
      true,
      resolve,
    )
    expect(result.url).toEndWith("/literal.uuid")
    expect(result.headers.test).toBe("literal.uuid")
    expect(result.formData?.[1]?.value).toBe("$random.missing")
    expect(await bodyForSend(result, new Headers())).toBe("literal.uuid=a%26b")
    const files = substitute(
      request({
        bodyType: "multipart",
        formData: [
          { name: "file", value: "$random.uuid", enabled: true, type: "file" },
          {
            name: "text",
            value: '$random.pick(["ok"])',
            enabled: true,
            type: "text",
          },
        ],
      }),
      env,
      true,
      resolve,
    )
    expect(files.formData?.map((entry) => entry.value)).toEqual([
      "literal.uuid",
      "ok",
    ])
    expect(
      substitute(
        request({ bodyType: "binary", filePath: "$random.uuid" }),
        env,
        true,
        resolve,
      ).filePath,
    ).toBe("literal.uuid")
  })

  it("remembers passwords before a later failure and rejects malformed expanded JSON", () => {
    const secrets: string[] = []
    expect(() =>
      substituteBodyTemplate(
        "$random.password $random.uuid(1)",
        false,
        () => "",
        createBodyValueResolver((value) => secrets.push(value)),
      ),
    ).toThrow("does not accept arguments")
    expect(secrets).toHaveLength(1)
    expect(secrets[0]).toHaveLength(15)
    expect(() => expand('{"id":$random.uuid,}', true)).toThrow(
      "Invalid JSON after body template substitution",
    )
  })

  it("scans calls as one token, ignoring variable-like literals in their arguments", () => {
    const source = '$random.pick(["$value", {"x":"(text)"}]) $value'
    const tokens = scanBodyTemplate(source)
    expect(tokens).toHaveLength(2)
    expect(tokens[0]?.kind).toBe("random")
    expect(tokens[1]?.kind).toBe("reference")
  })
})
