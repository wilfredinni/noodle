import { describe, expect, it } from "bun:test"
import { formatYamlValidationNotice } from "../../src/ui/editor/yamlValidation"

describe("formatYamlValidationNotice", () => {
  it("formats request validation with the filename and inferred field line", () => {
    const notice = formatYamlValidationNotice({
      kind: "request",
      fileName: "google copy copy 2.yml",
      source:
        "name: Google\nmethod: GET\nurl: https://example.com\ntimeout: nope\n",
      error: 'lang.parseRequest: "timeout" must be a finite number',
    })

    expect(notice).toEqual({
      title: "Invalid request YAML for google copy copy 2.yml",
      detail: 'Line 4: "timeout" must be a finite number',
    })
  })

  it("uses the folder validation title", () => {
    const notice = formatYamlValidationNotice({
      kind: "folder",
      fileName: "auth/folder.yml",
      source: "unknown: true\n",
      error: 'lang.parseFolder: unknown field "unknown"',
    })

    expect(notice.title).toBe("Invalid folder YAML for auth/folder.yml")
    expect(notice.detail).toBe('Line 1: unknown field "unknown"')
  })

  it("preserves parser-provided line and column information", () => {
    const notice = formatYamlValidationNotice({
      kind: "request",
      fileName: "broken.yml",
      source: "name: broken\nmethod: GET\nurl: [broken\n",
      error:
        "lang.parseRequest: YAML syntax: unexpected end of the stream (4:1)\n\n 1 | url: [broken",
    })

    expect(notice.detail).toBe("Line 4, Col 1: unexpected end of the stream")
  })

  it("omits a line when the offending field is missing", () => {
    const notice = formatYamlValidationNotice({
      kind: "request",
      fileName: "missing.yml",
      source: "name: missing\nmethod: GET\n",
      error: 'lang.parseRequest: missing required field "url"',
    })

    expect(notice.detail).toBe('missing required field "url"')
  })

  it("omits a line when a field match is ambiguous", () => {
    const notice = formatYamlValidationNotice({
      kind: "request",
      fileName: "duplicate.yml",
      source: "headers:\n  accept: json\nheaders:\n  content: text\n",
      error: 'lang.parseRequest: "headers" must be a map',
    })

    expect(notice.detail).toBe('"headers" must be a map')
  })
})
