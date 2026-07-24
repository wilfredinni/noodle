import { describe, expect, it, beforeEach, afterEach } from "bun:test"
import { homedir, tmpdir } from "node:os"
import { join } from "node:path"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import * as yaml from "js-yaml"
import {
  getDownloadsDir,
  exportTimelineEntry,
} from "../../src/filestore/timeline"
import type { TimelineEntry } from "../../src/schema"

describe("getDownloadsDir", () => {
  it("resolves home Downloads directory by default", async () => {
    delete process.env.NOODLE_DOWNLOADS_DIR
    const downloads = await getDownloadsDir()
    expect(downloads).toBe(join(homedir(), "Downloads"))
  })
})

describe("exportTimelineEntry", () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "noodle-downloads-"))
    process.env.NOODLE_DOWNLOADS_DIR = tempDir
  })

  afterEach(async () => {
    delete process.env.NOODLE_DOWNLOADS_DIR
    await rm(tempDir, { recursive: true, force: true })
  })

  it("exports full timeline entry as YAML into Downloads folder", async () => {
    const entry: TimelineEntry = {
      timestamp: 1000,
      id: "req-test-123",
      request: {
        id: "req-test-123",
        name: "Test",
        method: "GET",
        url: "https://example.com",
        headers: {},
        params: [],
      },
      response: {
        status: 200,
        statusText: "OK",
        headers: { "content-type": "application/json" },
        timeMs: 45,
        size: 17,
      },
    }
    const path = await exportTimelineEntry(
      "",
      entry,
      "response",
      '{"exported":true}',
    )
    expect(path).toBe(join(tempDir, "req-test-123.yml"))

    const content = await readFile(path, "utf8")
    const parsed = yaml.load(content) as TimelineEntry
    expect(parsed.id).toBe("req-test-123")
    expect(parsed.request.method).toBe("GET")
    expect(parsed.response?.status).toBe(200)
    expect(parsed.response?.body).toBe('{"exported":true}')
  })
})
