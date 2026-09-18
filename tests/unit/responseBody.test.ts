import { describe, expect, it } from "bun:test"
import {
  classifyResponseBody,
  responseContentType,
  responseFilename,
  responseImageFormat,
  suggestedResponseFilename,
} from "../../src/responseBody"
import { createResponseResolver } from "../../src/response"
import { runRequestScript } from "../../src/preRequestScript"
import { RunScope } from "../../src/runScope"

describe("response bodies", () => {
  it("uses byte detection for empty or malformed Content-Type values", () => {
    for (const type of ["", " ", "; charset=utf-8", "json", "text/", "a/b/c"])
      for (const name of ["content-type", "Content-Type"])
        for (const body of ["hello\n世界", '{"id":7}']) {
          const headers = { [name]: type }
          expect(responseContentType(headers)).toBe("application/octet-stream")
          expect(
            classifyResponseBody(new TextEncoder().encode(body), headers),
          ).toBe("text")
          expect(classifyResponseBody(new Uint8Array([255]), headers)).toBe(
            "binary",
          )
          expect(classifyResponseBody(new Uint8Array([0, 27]), headers)).toBe(
            "binary",
          )
        }
  })
  it("classifies MIME families and missing-type UTF-8 without mistaking files for text", () => {
    const bytes = new TextEncoder().encode("hello\n世界")
    for (const type of [
      "text/plain",
      "APPLICATION/JSON; charset=utf-8",
      "application/problem+json",
      "image/svg+xml",
      "application/javascript",
      "application/x-www-form-urlencoded",
    ])
      expect(classifyResponseBody(bytes, { "Content-Type": type })).toBe("text")
    for (const type of [
      "application/pdf",
      "application/octet-stream",
      "image/png",
      "application/zip",
      "application/unknown",
    ])
      expect(classifyResponseBody(bytes, { "content-type": type })).toBe(
        "binary",
      )
    expect(classifyResponseBody(bytes, {})).toBe("text")
    expect(classifyResponseBody(new Uint8Array(), {})).toBe("text")
    expect(classifyResponseBody(new Uint8Array([255]), {})).toBe("binary")
    expect(classifyResponseBody(new Uint8Array([0, 27, 65]), {})).toBe("binary")
    expect(
      classifyResponseBody(new TextEncoder().encode("\u009b31m"), {}),
    ).toBe("binary")
    expect(responseContentType({})).toBe("application/octet-stream")
    expect(responseContentType({ "content-type": "image/png\u009b31m" })).toBe(
      "application/octet-stream",
    )
  })
  it("recognizes image signatures without trusting extensions", () => {
    expect(
      responseImageFormat(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])),
    ).toBe("png")
    expect(responseImageFormat(new Uint8Array([255, 216, 255]))).toBe("jpeg")
    expect(responseImageFormat(new TextEncoder().encode("GIF89a"))).toBe("gif")
    expect(responseImageFormat(new TextEncoder().encode("RIFF0000WEBP"))).toBe(
      "webp",
    )
    expect(responseImageFormat(new Uint8Array([137, 80]))).toBeNull()
    expect(responseImageFormat(new TextEncoder().encode("%PDF"))).toBeNull()
  })
  it("prefers valid UTF-8 filenames and removes server paths and controls", () => {
    const header = (value: string) => ({ "Content-Disposition": value })
    expect(
      responseFilename(
        header(
          "attachment; filename=backup.png; filename*=UTF-8''%E2%98%83.png",
        ),
      ),
    ).toBe("☃.png")
    expect(
      responseFilename(header('attachment; filename="../../image.png\u001b"')),
    ).toBe("image.png")
    expect(
      responseFilename(header('attachment; filename="C:\\folder\\image.png"')),
    ).toBe("image.png")
    expect(
      responseFilename(
        header("attachment; filename*=UTF-8''%broken; filename=fallback.png"),
      ),
    ).toBe("fallback.png")
    expect(
      responseFilename(
        header("attachment; filename*=UTF-8''safe%C2%9B31m.png"),
      ),
    ).toBe("safe31m.png")
    expect(
      Buffer.byteLength(
        responseFilename(
          header(
            `attachment; filename*=UTF-8''${encodeURIComponent("😀".repeat(180))}`,
          ),
        )!,
      ),
    ).toBeLessThanOrEqual(180)
    for (const value of ["..", ".", "CON.exe", "NUL"])
      expect(
        responseFilename(header(`attachment; filename=${value}`)),
      ).toBeUndefined()
    expect(
      suggestedResponseFilename(
        { headers: { "content-type": "application/pdf" } },
        "../../report",
      ),
    ).toBe("report.pdf")
    expect(suggestedResponseFilename({ headers: {} }, "unknown")).toBe(
      "unknown.bin",
    )
  })
  it("keeps metadata expressions and rejects JSON body expressions for binary responses", () => {
    const resolve = createResponseResolver({
      status: 200,
      headers: { "X-Type": "binary" },
      timeMs: 5,
      body: "",
      bodyKind: "binary",
    })
    expect(resolve("status")).toEqual({ kind: "value", value: 200 })
    expect(resolve("headers.x-type")).toEqual({
      kind: "value",
      value: "binary",
    })
    expect(resolve("response.time")).toEqual({ kind: "value", value: 5 })
    expect(resolve("body.value")).toMatchObject({
      kind: "error",
      message: expect.stringContaining("binary"),
    })
  })
  it("decodes binary text only when a script asks, retaining cached JSON behavior and limits", async () => {
    const request = {
      id: "file",
      name: "File",
      method: "GET" as const,
      url: "http://localhost/",
      headers: {},
      params: [],
      timeout: 0,
    }
    const response = {
      status: 200,
      statusText: "OK",
      headers: {},
      timeMs: 0,
      body: "",
      bodyKind: "binary" as const,
      bodyBytes: new TextEncoder().encode('{"id":7}'),
    }
    const scope = new RunScope()
    const result = await runRequestScript(
      "post",
      'noodle.run.set("text", noodle.response.text()); noodle.run.set("id", noodle.response.json().id)',
      request,
      undefined,
      scope,
      { response },
    )
    expect(result.result.success).toBe(true)
    expect(scope.get("text")).toBe('{"id":7}')
    expect(scope.get("id")).toBe(7)
    const oversized = await runRequestScript(
      "post",
      "noodle.response.text()",
      request,
      undefined,
      scope,
      {
        response: {
          ...response,
          bodyBytes: new Uint8Array(5 * 1024 * 1024 + 1),
        },
      },
    )
    expect(oversized.result.error?.message).toContain("exceeds")
    const expanded = await runRequestScript(
      "post",
      "noodle.response.text()",
      request,
      undefined,
      scope,
      {
        response: {
          ...response,
          bodyBytes: new Uint8Array(2 * 1024 * 1024).fill(255),
        },
      },
    )
    expect(expanded.result.error?.message).toContain("exceeds")
    const text = "x".repeat(5 * 1024 * 1024)
    const textScope = new RunScope()
    const exact = await runRequestScript(
      "post",
      'noodle.run.set("length", noodle.response.text().length)',
      request,
      undefined,
      textScope,
      {
        response: {
          ...response,
          bodyKind: "text",
          body: text,
          bodyBytes: new TextEncoder().encode("\ufeff" + text),
        },
      },
    )
    expect(exact.result.success).toBe(true)
    expect(textScope.get("length")).toBe(text.length)
  })
})
