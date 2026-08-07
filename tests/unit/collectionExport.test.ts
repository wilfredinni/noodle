import { describe, expect, it } from "bun:test"
import { join } from "node:path"
import { runCollectionExport } from "../../src/ui/collectionExport"
import type { ExportOptions, ExportResult } from "../../src/app/export"

const RESULT: ExportResult = {
  path: "/exports/orders.openapi.yml",
  name: "orders",
  format: "openapi",
  operationCount: 1,
}

describe("runCollectionExport", () => {
  it("rejects unsaved edits before export", async () => {
    let called = false
    const pending = { current: false }

    await expect(
      runCollectionExport({
        collectionDir: "/collections/orders",
        collectionName: "orders",
        values: { format: "openapi", outputDir: "/exports" },
        hasUnsavedChanges: true,
        pending,
        runExport: async () => {
          called = true
          return RESULT
        },
      }),
    ).rejects.toThrow("Save all changes before exporting")
    expect(called).toBe(false)
    expect(pending.current).toBe(false)
  })

  it("generates format targets and ignores duplicate submissions", async () => {
    const calls: ExportOptions[] = []
    const pending = { current: false }
    let finish: ((result: ExportResult) => void) | undefined
    const runExport = (options: ExportOptions) => {
      calls.push(options)
      return new Promise<ExportResult>((resolve) => {
        finish = resolve
      })
    }
    const options = {
      collectionDir: "/collections/orders",
      collectionName: "orders",
      values: { format: "openapi", outputDir: "/exports" } as const,
      hasUnsavedChanges: false,
      pending,
      runExport,
    }

    const first = runCollectionExport(options)
    expect(pending.current).toBe(true)
    expect(await runCollectionExport(options)).toBeNull()
    expect(calls).toEqual([
      {
        collection: "/collections/orders",
        format: "openapi",
        output: join("/exports", "orders.openapi.yml"),
      },
    ])

    finish?.(RESULT)
    expect(await first).toBe(RESULT)
    expect(pending.current).toBe(false)

    await runCollectionExport({
      ...options,
      values: { format: "postman", outputDir: "/exports" },
      runExport: async (call) => {
        calls.push(call)
        return { ...RESULT, format: "postman" }
      },
    })
    expect(calls[1]?.output).toBe(join("/exports", "orders-postman"))
  })

  it("clears the pending guard after failures", async () => {
    const pending = { current: false }
    await expect(
      runCollectionExport({
        collectionDir: "/collections/orders",
        collectionName: "orders",
        values: { format: "openapi", outputDir: "/exports" },
        hasUnsavedChanges: false,
        pending,
        runExport: async () => {
          throw new Error("write failed")
        },
      }),
    ).rejects.toThrow("write failed")
    expect(pending.current).toBe(false)
  })
})
