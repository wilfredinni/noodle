import { describe, expect, it } from "bun:test"
import { generateCode, findCodeTarget } from "../../src/codegen"
import { hashVars } from "../../src/codegen/variableHash"
import { highlightGeneratedCode } from "../../src/ui/overlays/codeSyntax"
import { THEMES } from "../../src/ui/theme-data"
import type { Request } from "../../src/schema"

function makeRequest(overrides: Partial<Request> = {}): Request {
  return {
    id: "repro",
    name: "Repro",
    method: "GET",
    url: "https://api.example.com/path",
    timeout: 0,
    headers: {},
    params: [],
    ...overrides,
  }
}

function curlTarget() {
  return findCodeTarget("shell-curl")!
}

function djb2(s: string): number {
  let hash = 5381
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 33) ^ s.charCodeAt(i)
  }
  return hash >>> 0
}

const WORD_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_"

function findCollisionPair(): { a: string; b: string } {
  const seen = new Map<number, string>()
  const base = WORD_CHARS.length
  for (let len = 1; len <= 3; len++) {
    const chars: number[] = new Array(len).fill(0)
    let done = false
    while (!done) {
      const s = "$" + chars.map((c) => WORD_CHARS[c]!).join("")
      const h = djb2(s)
      const existing = seen.get(h)
      if (existing !== undefined && existing !== s) {
        return { a: existing, b: s }
      }
      seen.set(h, s)
      done = true
      for (let i = len - 1; i >= 0; i--) {
        chars[i] = chars[i]! + 1
        if (chars[i]! >= base) {
          chars[i] = 0
        } else {
          done = false
          break
        }
      }
    }
  }
  throw new Error("No collision found")
}

describe("repro: B1 — scheme-less URL leaks injected http:// prefix", () => {
  it("generated snippet does not contain the injected scheme", () => {
    const request = makeRequest({
      url: "$base_url/users",
      bodyType: "none",
      body: undefined,
      headers: {
        Authorization: { value: "Bearer $TOKEN", enabled: true },
      },
    })
    const result = generateCode(request, curlTarget())
    expect(result.code).not.toContain("http://$base_url")
    expect(result.code).toContain("$base_url")
  })
})

describe("repro: B2 — hash collision in hashVars loses variable", () => {
  it("djb2 has collisions on $VAR names", () => {
    const { a, b } = findCollisionPair()
    expect(djb2(a)).toBe(djb2(b))
    expect(a).not.toBe(b)
  })

  it("hashVars restores both colliding variables (counter-based)", () => {
    const { a, b } = findCollisionPair()
    const url = `/${a}/items/${b}/meta`
    const result = hashVars(url)
    const restored = result.restore(result.hashed)
    expect(restored).toContain(a)
    expect(restored).toContain(b)
    expect(restored).toBe(url)
  })
})

describe("repro: S1 — multi-line triple-quoted string highlighting", () => {
  it("handles multi-line docstrings across lines", () => {
    const code = 'print("hello")\nmsg = """\nA multi-line\ndocstring\n"""'
    const result = highlightGeneratedCode(code, THEMES[0]!)
    expect(result.length).toBe(5)
  })

  it("handles multi-line single-quoted triple strings", () => {
    const code = "x = '''\nline1\nline2\n'''"
    const result = highlightGeneratedCode(code, THEMES[0]!)
    expect(result.length).toBe(4)
  })

  it("handles unclosed triple-quote at end of input gracefully", () => {
    const code = 'x = """\nline1\nline2'
    const result = highlightGeneratedCode(code, THEMES[0]!)
    expect(result.length).toBe(3)
  })

  it("handles same-line open-close triple-quote normally", () => {
    const code = 'x = """single-line doc"""'
    const result = highlightGeneratedCode(code, THEMES[0]!)
    expect(result.length).toBe(1)
  })
})

describe("repro: CVE-2026-12143 — CRLF injection in multipart form field names", () => {
  const poisoned = 'email"\r\nX-Injected: true\r\nfaked="'

  it("does not throw when generating code with CRLF in field names", () => {
    const request = makeRequest({
      method: "POST",
      url: "https://api.example.com/upload",
      bodyType: "multipart",
      body: undefined,
      formData: [
        { name: poisoned, value: "x@x.com", enabled: true, type: "text" },
      ],
    })
    expect(() => generateCode(request, curlTarget())).not.toThrow()
    expect(() =>
      generateCode(request, findCodeTarget("python-requests")!),
    ).not.toThrow()
  })

  it("encodes CRLF in Content-Disposition names for raw-body targets", () => {
    const request = makeRequest({
      method: "POST",
      url: "https://api.example.com/upload",
      bodyType: "multipart",
      body: undefined,
      formData: [
        { name: poisoned, value: "x@x.com", enabled: true, type: "text" },
      ],
    })
    const result = generateCode(request, findCodeTarget("python-requests")!)
    expect(result.code).toContain("%0D%0A")
    expect(result.code).toContain("%22")
    // the patch prevents literal CRLF from appearing as a new part boundary
    expect(result.code).not.toContain("\r\nContent-Disposition")
  })
})
