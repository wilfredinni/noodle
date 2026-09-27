import { afterEach, describe, expect, it } from "bun:test"
import { act } from "react"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createTestRender } from "../testRender"
import { useSaveFile, type UseSaveFileResult } from "../../src/ui/useSaveFile"
import { createScriptDiagnostics } from "../../src/ui/editor/scriptDiagnostics"
import { formatCodeFields } from "../../src/ui/editor/codeFormatting"
import { parseRequest } from "../../src/lang/parse"
import type { Request } from "../../src/schema"

const testRender = createTestRender()
const directories: string[] = []
const services: ReturnType<typeof createScriptDiagnostics>[] = []
afterEach(async () => {
  for (const service of services.splice(0)) service.dispose()
  for (const dir of directories.splice(0))
    await rm(dir, { recursive: true, force: true })
})

describe("format on save", () => {
  it.each([false, true])(
    "saves request bodies and inline scripts with formatting enabled: %s",
    async (enabled) => {
      const dir = await mkdtemp(join(tmpdir(), "noodle-format-save-"))
      directories.push(dir)
      const service = createScriptDiagnostics()
      services.push(service)
      const request: Request = {
        id: "request",
        name: "Request",
        method: "POST",
        url: "https://example.com",
        headers: {},
        params: [],
        timeout: 0,
        bodyType: "json",
        body: '{"n":90071992547409931234,"v":$VALUE}',
        scripts: { pre: "const x={a:1}", post: "./scripts/post.js" },
        tests: "test(",
      }
      let save!: UseSaveFileResult
      let saved: Request | undefined
      function Harness() {
        save = useSaveFile(
          dir,
          request,
          request.id,
          (value) => {
            saved = value
          },
          enabled
            ? async (value) => (await formatCodeFields(value, service)).fields
            : undefined,
        )
        return null
      }
      await testRender(<Harness />, { width: 60, height: 12 })
      await act(async () => {
        await save.doSave()
      })
      expect(save.saveState.kind).toBe("success")
      const disk = parseRequest(
        "request",
        await readFile(join(dir, "request.yml"), "utf8"),
      )
      expect(disk.body).toBe(
        enabled
          ? '{\n  "n": 90071992547409931234,\n  "v": $VALUE\n}'
          : request.body,
      )
      expect(disk.scripts?.pre).toBe(
        enabled ? "const x = { a: 1 }" : request.scripts?.pre,
      )
      expect(disk.scripts?.post).toBe("./scripts/post.js")
      expect(disk.tests).toBe("test(")
      expect(saved?.body).toBe(disk.body)
      save.clearSaveTimer()
    },
  )
})
