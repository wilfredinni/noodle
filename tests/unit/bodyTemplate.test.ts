import { describe, expect, it } from "bun:test"
import {
  createBodyRandomResolver,
  previewBodyRandom,
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
    createBodyRandomResolver(() => {}),
  )

describe("request body templates", () => {
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
      previewBodyRandom,
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
        createBodyRandomResolver(() => {
          throw new Error("generated")
        }),
      ).body,
    ).toBe(body)
  })

  it("handles literal text, XML and encoded forms while excluding names and file paths", async () => {
    const resolve = createBodyRandomResolver(() => {})
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
        createBodyRandomResolver((value) => secrets.push(value)),
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
