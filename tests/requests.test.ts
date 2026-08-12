import { describe, it, expect } from "bun:test"
import type { Request, Environment } from "../src/schema"
import { substitute } from "../src/requests/substitute"
import { bodyForSend } from "../src/requests/send"

function makeReq(over: Partial<Request> = {}): Request {
  return {
    id: "test",
    name: "Test",
    method: "POST",
    url: "https://example.com/api",
    headers: {},
    params: [],
    timeout: 0,
    followRedirects: true,
    maxRedirects: 5,
    auth: { type: "none" },
    ...over,
  }
}

describe("substitute — formData", () => {
  it("substitutes $var in formData name and value", () => {
    const env: Environment = {
      name: "dev",
      vars: { KEY: "username", VAL: "john" },
    }
    const req = makeReq({
      bodyType: "urlencoded",
      formData: [{ name: "$KEY", value: "$VAL", enabled: true, type: "text" }],
    })
    const result = substitute(req, env)
    expect(result.formData).toEqual([
      { name: "username", value: "john", enabled: true, type: "text" },
    ])
  })

  it("substitutes $var in filePath for binary", () => {
    const env: Environment = { name: "dev", vars: { PATH: "/tmp/data.bin" } }
    const req = makeReq({
      bodyType: "binary",
      filePath: "$PATH",
    })
    const result = substitute(req, env)
    expect(result.filePath).toBe("/tmp/data.bin")
  })

  it("substitutes $var in formData file path", () => {
    const env: Environment = {
      name: "dev",
      vars: { IMG: "/photos/avatar.png" },
    }
    const req = makeReq({
      bodyType: "multipart",
      formData: [{ name: "pic", value: "$IMG", enabled: true, type: "file" }],
    })
    const result = substitute(req, env)
    expect(result.formData).toEqual([
      { name: "pic", value: "/photos/avatar.png", enabled: true, type: "file" },
    ])
  })

  it("preserves disabled entries without substitution", () => {
    const env: Environment = { name: "dev", vars: { X: "y" } }
    const req = makeReq({
      bodyType: "urlencoded",
      formData: [
        { name: "a", value: "$X", enabled: false, type: "text" },
        { name: "b", value: "$X", enabled: true, type: "text" },
      ],
    })
    const result = substitute(req, env)
    expect(result.formData).toEqual([
      { name: "a", value: "$X", enabled: false, type: "text" },
      { name: "b", value: "y", enabled: true, type: "text" },
    ])
  })

  it("does not throw on disabled formData with unresolved $var", () => {
    const env: Environment = { name: "dev", vars: {} }
    const req = makeReq({
      bodyType: "urlencoded",
      formData: [
        { name: "good", value: "v", enabled: true, type: "text" },
        { name: "bad", value: "$MISSING", enabled: false, type: "text" },
      ],
    })
    expect(() => substitute(req, env)).not.toThrow()
  })

  it("throws on unresolved $var in formData name", () => {
    const env: Environment = { name: "dev", vars: {} }
    const req = makeReq({
      bodyType: "urlencoded",
      formData: [{ name: "$MISSING", value: "v", enabled: true, type: "text" }],
    })
    expect(() => substitute(req, env)).toThrow(
      'requests.substitute: unresolved variable "MISSING" in formData[0].name',
    )
  })

  it("throws on unresolved $var in formData value", () => {
    const env: Environment = { name: "dev", vars: {} }
    const req = makeReq({
      bodyType: "urlencoded",
      formData: [
        { name: "key", value: "$MISSING", enabled: true, type: "text" },
      ],
    })
    expect(() => substitute(req, env)).toThrow(
      'requests.substitute: unresolved variable "MISSING" in formData[0].value',
    )
  })

  it("throws on unresolved $var in filePath for binary", () => {
    const env: Environment = { name: "dev", vars: {} }
    const req = makeReq({
      bodyType: "binary",
      filePath: "$MISSING",
    })
    expect(() => substitute(req, env)).toThrow(
      'requests.substitute: unresolved variable "MISSING" in filePath',
    )
  })

  it("substitutes $var in body string (existing behavior unchanged)", () => {
    const env: Environment = { name: "dev", vars: { ID: "42" } }
    const req = makeReq({ body: '{"id": $ID}' })
    const result = substitute(req, env)
    expect(result.body).toBe('{"id": 42}')
  })

  it("returns undefined formData when request has none", () => {
    const env: Environment = { name: "dev", vars: {} }
    const req = makeReq()
    const result = substitute(req, env)
    expect(result.formData).toBeUndefined()
  })

  it("returns undefined filePath when request has none", () => {
    const env: Environment = { name: "dev", vars: {} }
    const req = makeReq({ bodyType: "binary" })
    const result = substitute(req, env)
    expect(result.filePath).toBeUndefined()
  })
})

describe("substitute — AWS SigV4", () => {
  it("substitutes every credential and scope field", () => {
    const result = substitute(
      makeReq({
        auth: {
          type: "aws_sigv4",
          access_key: "$ACCESS",
          secret_key: "$SECRET",
          region: "$REGION",
          service: "$SERVICE",
          session_token: "$SESSION",
        },
      }),
      {
        name: "dev",
        vars: {
          ACCESS: "AKID",
          SECRET: "secret",
          REGION: "us-east-1",
          SERVICE: "execute-api",
          SESSION: "token",
        },
      },
    )

    expect(result.auth).toEqual({
      type: "aws_sigv4",
      access_key: "AKID",
      secret_key: "secret",
      region: "us-east-1",
      service: "execute-api",
      session_token: "token",
    })
  })

  it("reports the unresolved AWS field", () => {
    expect(() =>
      substitute(
        makeReq({
          auth: {
            type: "aws_sigv4",
            access_key: "AKID",
            secret_key: "$MISSING",
            region: "us-east-1",
            service: "execute-api",
          },
        }),
        { name: "dev", vars: {} },
      ),
    ).toThrow('unresolved variable "MISSING" in auth.secret_key')
  })
})

describe("substitute — params", () => {
  it("substitutes $var in param name and value", () => {
    const env: Environment = {
      name: "dev",
      vars: { K: "userId", V: "42" },
    }
    const req = makeReq({
      params: [{ name: "$K", value: "$V", enabled: true }],
    })
    const result = substitute(req, env)
    expect(result.params).toEqual([
      { name: "userId", value: "42", enabled: true },
    ])
  })

  it("does not throw on disabled param with unresolved $var", () => {
    const env: Environment = { name: "dev", vars: {} }
    const req = makeReq({
      params: [
        { name: "good", value: "1", enabled: true },
        { name: "bad", value: "$MISSING", enabled: false },
      ],
    })
    expect(() => substitute(req, env)).not.toThrow()
  })

  it("throws on enabled param with unresolved $var", () => {
    const env: Environment = { name: "dev", vars: {} }
    const req = makeReq({
      params: [{ name: "bad", value: "$MISSING", enabled: true }],
    })
    expect(() => substitute(req, env)).toThrow(
      'requests.substitute: unresolved variable "MISSING" in params[0].value',
    )
  })

  it("preserves disabled params without substitution", () => {
    const env: Environment = { name: "dev", vars: { X: "y" } }
    const req = makeReq({
      params: [
        { name: "a", value: "$X", enabled: false },
        { name: "b", value: "$X", enabled: true },
      ],
    })
    const result = substitute(req, env)
    expect(result.params).toEqual([
      { name: "a", value: "$X", enabled: false },
      { name: "b", value: "y", enabled: true },
    ])
  })
})

describe("bodyForSend — bodyType routing", () => {
  it("returns undefined when bodyType is none", async () => {
    const h = new Headers()
    const result = await bodyForSend(
      { bodyType: "none", body: "should be ignored" },
      h,
    )
    expect(result).toBeUndefined()
  })

  it("returns undefined when bodyType is none even with body set", async () => {
    const h = new Headers()
    const result = await bodyForSend(
      { bodyType: "none", body: '{"key":"val"}' },
      h,
    )
    expect(result).toBeUndefined()
  })

  it("returns body when bodyType is json", async () => {
    const h = new Headers()
    const result = await bodyForSend(
      { bodyType: "json", body: '{"key":"val"}' },
      h,
    )
    expect(result).toBe('{"key":"val"}')
    expect(h.get("content-type")).toBe("application/json")
  })

  it("returns undefined when bodyType is json but body is undefined", async () => {
    const h = new Headers()
    const result = await bodyForSend({ bodyType: "json", body: undefined }, h)
    expect(result).toBeUndefined()
  })

  it("returns body as-is when bodyType is undefined (backward compat)", async () => {
    const h = new Headers()
    const result = await bodyForSend({ body: "raw text" }, h)
    expect(result).toBe("raw text")
  })

  it("returns undefined when bodyType is binary and no filePath", async () => {
    const h = new Headers()
    const result = await bodyForSend({ bodyType: "binary" }, h)
    expect(result).toBeUndefined()
  })

  it("sets content-type even when user already set one (json)", async () => {
    const h = new Headers({ "content-type": "text/plain" })
    const result = await bodyForSend(
      { bodyType: "json", body: '{"key":"val"}' },
      h,
    )
    expect(result).toBe('{"key":"val"}')
    expect(h.get("content-type")).toBe("application/json")
  })

  it("sets content-type even when user already set one (urlencoded)", async () => {
    const h = new Headers({ "content-type": "application/json" })
    const result = await bodyForSend(
      {
        bodyType: "urlencoded",
        formData: [{ name: "q", value: "hello", enabled: true, type: "text" }],
      },
      h,
    )
    expect(result).toBe("q=hello")
    expect(h.get("content-type")).toBe("application/x-www-form-urlencoded")
  })

  it("sets content-type even when user already set one (binary)", async () => {
    const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs")
    const { join } = await import("node:path")
    const dir = mkdtempSync("/tmp/noodle-test-")
    const filePath = join(dir, "data.bin")
    writeFileSync(filePath, "binary content")

    try {
      const h = new Headers({ "content-type": "application/json" })
      const result = await bodyForSend({ bodyType: "binary", filePath }, h)
      expect(result).toBeDefined()
      expect(h.get("content-type")).toBe("application/octet-stream")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("deletes user-set content-type for multipart", async () => {
    const h = new Headers({ "content-type": "application/json" })
    const result = await bodyForSend(
      {
        bodyType: "multipart",
        formData: [
          { name: "field", value: "val", enabled: true, type: "text" },
        ],
      },
      h,
    )
    expect(result).toBeDefined()
    expect(h.get("content-type")).toBeNull()
  })
})

describe("bodyForSend — file validation", () => {
  it("expands home-relative binary and multipart paths after substitution", async () => {
    const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs")
    const { homedir, tmpdir } = await import("node:os")
    const { join, relative, sep } = await import("node:path")
    const dir = mkdtempSync(join(tmpdir(), "noodle-home-path-"))
    const filePath = join(dir, "data.bin")
    writeFileSync(filePath, "binary content")
    const shorthand = `@/${relative(homedir(), filePath).split(sep).join("/")}`

    try {
      const binary = substitute(
        makeReq({ bodyType: "binary", filePath: "$UPLOAD" }),
        { name: "dev", vars: { UPLOAD: shorthand } },
      )
      expect(await bodyForSend(binary, new Headers())).toBeDefined()

      const multipart = substitute(
        makeReq({
          bodyType: "multipart",
          formData: [
            {
              name: "file",
              value: "$UPLOAD",
              enabled: true,
              type: "file",
            },
          ],
        }),
        { name: "dev", vars: { UPLOAD: shorthand } },
      )
      expect(await bodyForSend(multipart, new Headers())).toBeDefined()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("keeps the home shorthand in missing-file errors", async () => {
    const value = "@/definitely-missing-noodle-file.bin"
    await expect(
      bodyForSend({ bodyType: "binary", filePath: value }, new Headers()),
    ).rejects.toThrow(`file not found: ${value}`)
  })

  it("throws when multipart file entry path does not exist", async () => {
    const h = new Headers()
    const fn = () =>
      bodyForSend(
        {
          bodyType: "multipart",
          formData: [
            {
              name: "photo",
              value: "/nonexistent/path/photo.png",
              enabled: true,
              type: "file",
            },
          ],
        },
        h,
      )
    await expect(fn()).rejects.toThrow(
      "file not found: /nonexistent/path/photo.png",
    )
  })

  it("throws when binary filePath does not exist", async () => {
    const h = new Headers()
    const fn = () =>
      bodyForSend(
        { bodyType: "binary", filePath: "/nonexistent/path/data.bin" },
        h,
      )
    await expect(fn()).rejects.toThrow(
      "file not found: /nonexistent/path/data.bin",
    )
  })

  it("does not throw when multipart file entry exists", async () => {
    const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs")
    const { join } = await import("node:path")
    const dir = mkdtempSync("/tmp/noodle-test-")
    const filePath = join(dir, "test.txt")
    writeFileSync(filePath, "hello")

    try {
      const h = new Headers()
      const result = await bodyForSend(
        {
          bodyType: "multipart",
          formData: [
            { name: "file", value: filePath, enabled: true, type: "file" },
          ],
        },
        h,
      )
      expect(result).toBeDefined()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("does not throw when binary filePath exists", async () => {
    const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs")
    const { join } = await import("node:path")
    const dir = mkdtempSync("/tmp/noodle-test-")
    const filePath = join(dir, "data.bin")
    writeFileSync(filePath, "binary content")

    try {
      const h = new Headers()
      const result = await bodyForSend({ bodyType: "binary", filePath }, h)
      expect(result).toBeDefined()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("does not validate text entries in multipart (no file check)", async () => {
    const h = new Headers()
    // Text entries with made-up values should not trigger file validation
    const result = await bodyForSend(
      {
        bodyType: "multipart",
        formData: [
          { name: "username", value: "john", enabled: true, type: "text" },
        ],
      },
      h,
    )
    expect(result).toBeDefined()
  })
})
