import { describe, it, expect, beforeAll, afterAll } from "bun:test"
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { lang } from "../../src/lang"
import type { Request } from "../../src/schema"

describe("NewRequestOverlay integration", () => {
  let tmpDir: string

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "noodle-int-newreq-"))
  })

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it("serializes a request with all fields and round-trips through lang.parseRequest", () => {
    const req: Request = {
      id: "get-users",
      name: "Get Users",
      method: "POST",
      url: "$base_url/users",
      timeout: 0,
      followRedirects: true,
      maxRedirects: 5,
      headers: {},
      params: {},
      auth: { type: "none" },
      bodyType: "none",
      body: "",
    }

    const yaml = lang.serializeRequest(req)
    expect(yaml.length).toBeGreaterThan(0)

    writeFileSync(join(tmpDir, "get-users.yml"), yaml, "utf8")

    const raw = readFileSync(join(tmpDir, "get-users.yml"), "utf8")
    const parsed = lang.parseRequest("get-users", raw)

    expect(parsed.id).toBe("get-users")
    expect(parsed.name).toBe("Get Users")
    expect(parsed.method).toBe("POST")
    expect(parsed.url).toBe("$base_url/users")
    expect(parsed.auth?.type).toBe("none")
    expect(parsed.bodyType).toBe("none")
    expect(parsed.timeout).toBe(0)
  })

  it("serializes a minimal request and round-trips correctly", () => {
    const req: Request = {
      id: "minimal",
      name: "Minimal",
      method: "GET",
      url: "/test",
      timeout: 0,
      headers: {},
      params: {},
    }

    const yaml = lang.serializeRequest(req)
    writeFileSync(join(tmpDir, "minimal.yml"), yaml, "utf8")

    const raw = readFileSync(join(tmpDir, "minimal.yml"), "utf8")
    const parsed = lang.parseRequest("minimal", raw)

    expect(parsed.id).toBe("minimal")
    expect(parsed.name).toBe("Minimal")
    expect(parsed.method).toBe("GET")
    expect(parsed.url).toBe("/test")
  })
})
