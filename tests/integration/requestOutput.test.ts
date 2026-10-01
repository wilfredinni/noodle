import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

const command = process.env.NOODLE_TEST_BINARY
  ? [process.env.NOODLE_TEST_BINARY]
  : [process.execPath, "src/app/cli.ts"]
const flags = ["--body", "--headers", "--cookies"]
const body =
  '{"message":"visible-body","token":"known-response-secret","cookie":"response-cookie-secret"}'
const redactedBody =
  '{"message":"visible-body","token":"[REDACTED]","cookie":"[REDACTED]"}'
const payload = new Uint8Array([0, 255, 10, 13])
let dir: string
let server: ReturnType<typeof Bun.serve>

async function cli(...args: string[]) {
  const child = Bun.spawn([...command, ...args], {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, NO_COLOR: "1" },
  })
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  return { stdout, stderr, code }
}
const run = (...args: string[]) =>
  cli("request", "run", "get", "--collection", dir, "--noproxy", ...args)
const save = (path = "/", extra = "") =>
  writeFile(
    join(dir, "get.yml"),
    `name: Get\nmethod: GET\nurl: http://127.0.0.1:${server.port}${path}\nauth:\n  type: bearer\n  token: known-response-secret\n${extra}`,
  )

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "noodle-request-output-"))
  await writeFile(join(dir, "settings.yml"), "cookies:\n  enabled: false\n")
  server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(req) {
      const path = new URL(req.url).pathname
      if (path === "/empty") return new Response(null, { status: 204 })
      if (path === "/binary")
        return new Response(payload, {
          headers: { "Content-Type": "application/octet-stream" },
        })
      const headers = new Headers({
        Date: "Wed, 01 Jan 2020 00:00:00 GMT",
        "Content-Type": "application/json",
        "X-Detail": "visible-header",
        "X-Token": "header-secret",
        "X-Echo": "known-response-secret",
      })
      headers.append(
        "Set-Cookie",
        "session=response-cookie-secret; Path=/; HttpOnly; SameSite=Lax",
      )
      headers.append("Set-Cookie", "short=x; Max-Age=0; Secure")
      headers.append(
        "Set-Cookie",
        "metadata=y; Domain=known-response-secret.example; Path=/known-response-secret",
      )
      return new Response(body, {
        status: path === "/error" ? 422 : 200,
        headers,
      })
    },
  })
  await save()
})
afterEach(async () => {
  server.stop(true)
  await rm(dir, { recursive: true, force: true })
})

describe("request run response output", () => {
  it("combines human sections while retaining the default summary and redaction", async () => {
    for (let combination = 0; combination < 8; combination++) {
      const selected = flags.filter(
        (_flag, index) => combination & (1 << index),
      )
      const output = await run(...selected)
      expect(output.code).toBe(0)
      expect(output.stderr).toBe("")
      expect(output.stdout).toContain("✓ GET get  200 OK")
      for (const [flag, section] of [
        ["--body", "Body:"],
        ["--headers", "Headers:"],
        ["--cookies", "Cookies:"],
      ] as const)
        expect(output.stdout.includes(section)).toBe(selected.includes(flag))
      if (selected.includes("--body"))
        expect(output.stdout).toContain(`Body:\n${redactedBody}`)
      if (selected.includes("--headers")) {
        expect(output.stdout).toContain("x-detail: visible-header")
        expect(output.stdout).toContain("x-token: [REDACTED]")
        expect(output.stdout).toContain("set-cookie: [REDACTED]")
      }
      if (selected.includes("--cookies")) {
        expect(output.stdout).toContain(
          "session=[REDACTED]; Path=/; HttpOnly; SameSite=lax",
        )
        expect(output.stdout).toContain("short=[REDACTED]")
        expect(output.stdout).toContain("Domain=[REDACTED].example")
      }
      for (const secret of [
        "known-response-secret",
        "response-cookie-secret",
        "header-secret",
      ])
        expect(output.stdout).not.toContain(secret)
    }
  })

  it("includes redacted cookies automatically in both JSON run types", async () => {
    const responses = []
    for (const output of [
      await run("--json"),
      await run("--json", ...flags),
      await cli("collection", "run", dir, "--noproxy", "--json"),
    ]) {
      expect(output.code).toBe(0)
      expect(output.stderr).toBe("")
      const envelope = JSON.parse(output.stdout)
      expect(Object.keys(envelope)).toEqual(["status", "data", "errors"])
      expect(envelope.status).toBe("success")
      expect(envelope.errors).toEqual([])
      const response = (envelope.data.result ?? envelope.data.results[0])
        .response
      expect(response).toMatchObject({
        body: redactedBody,
        headers: { "x-detail": "visible-header", "x-token": "[REDACTED]" },
        cookies: [
          {
            name: "session",
            value: "[REDACTED]",
            path: "/",
            httpOnly: true,
            sameSite: "lax",
          },
          {
            name: "short",
            value: "[REDACTED]",
            expires: "1970-01-01T00:00:00.000Z",
            secure: true,
          },
          {
            name: "metadata",
            value: "[REDACTED]",
            domain: "[REDACTED].example",
            path: "/[REDACTED]",
          },
        ],
      })
      responses.push({ ...response, timeMs: 0 })
      for (const secret of [
        "known-response-secret",
        "response-cookie-secret",
        "header-secret",
      ])
        expect(output.stdout).not.toContain(secret)
    }
    expect(responses[1]).toEqual(responses[0])
    expect(responses[2]).toEqual(responses[0])
    const human = await cli("collection", "run", dir, "--noproxy")
    for (const section of ["Headers:", "Cookies:", "Body:"])
      expect(human.stdout).not.toContain(section)
  })

  it("retains response details and failure status for HTTP errors", async () => {
    await save("/error")
    const human = await run(...flags)
    expect(human.code).toBe(1)
    expect(human.stdout).toContain("422 Unprocessable Entity")
    expect(human.stdout).toContain("Failure: HTTP error")
    for (const section of ["Headers:", "Cookies:", `Body:\n${redactedBody}`])
      expect(human.stdout).toContain(section)
    const json = await run("--json", ...flags)
    expect(json.code).toBe(1)
    expect(JSON.parse(json.stdout)).toMatchObject({
      status: "error",
      data: {
        result: { failureCategories: ["http"], response: { status: 422 } },
      },
    })
  })

  it("handles empty and binary bodies while preserving original file output", async () => {
    await save("/empty")
    const empty = await run("--body", "--cookies")
    expect(empty.code).toBe(0)
    expect(empty.stdout).toContain("Body:\n(empty)")
    expect(empty.stdout).toContain("Cookies:\n  (none)")
    for (const output of [
      await run("--json", ...flags),
      await cli("collection", "run", dir, "--noproxy", "--json"),
    ]) {
      const data = JSON.parse(output.stdout).data
      expect((data.result ?? data.results[0]).response.cookies).toBeUndefined()
    }
    await save("/binary")
    const destination = join(dir, "response.bin")
    const binary = await run("--body", "--output", destination)
    expect(binary.code).toBe(0)
    expect(binary.stdout).toContain(
      "Binary: application/octet-stream · 4 bytes",
    )
    expect(binary.stdout).toContain("use --output <file>")
    expect(binary.stdout).not.toContain("\u0000")
    expect(new Uint8Array(await readFile(destination))).toEqual(payload)
    const json = JSON.parse((await run("--json", "--body")).stdout)
    expect(json.data.result.response).toMatchObject({
      bodyKind: "binary",
      size: 4,
    })
    expect(json.data.result.response.body).toBeUndefined()
  })

  it("keeps pre-script, transport, and configuration failures free of response sections", async () => {
    await save("/", "scripts:\n  pre: throw Error('pre-failed')\n")
    const pre = await run(...flags)
    expect(pre.code).toBe(1)
    expect(pre.stdout).toContain("pre-failed")
    await save()
    server.stop(true)
    const transport = await run(...flags)
    expect(transport.code).toBe(1)
    expect(transport.stdout).toContain("Failure: transport error")
    for (const output of [pre, transport])
      for (const section of ["Headers:", "Cookies:", "Body:"])
        expect(output.stdout).not.toContain(section)
    const missing = await cli(
      "request",
      "run",
      "missing",
      "--collection",
      dir,
      "--json",
      ...flags,
    )
    expect(missing.code).toBe(2)
    expect(JSON.parse(missing.stdout)).toEqual({
      status: "error",
      data: null,
      errors: ["request not found: missing"],
    })
  })
})
