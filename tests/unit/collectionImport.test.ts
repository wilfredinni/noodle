import { describe, expect, it } from "bun:test"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { homedir, tmpdir } from "node:os"
import { join } from "node:path"
import type { ImportOptions } from "../../src/app/import"
import { runCollectionImport } from "../../src/ui/collectionImport"

const RESULT = {
  path: "/collections/imported",
  name: "Imported",
  formattedJsonBodies: 0,
}

describe("runCollectionImport", () => {
  it("expands paths and builds a new-collection import", async () => {
    let received: ImportOptions | undefined
    const result = await runCollectionImport({
      values: {
        source: "@/specs/api.yml",
        destination: "new",
        parentDir: "@/collections",
      },
      collectionDir: "/current",
      hasUnsavedChanges: false,
      pending: { current: false },
      runImport: async (options) => {
        received = options
        return RESULT
      },
    })

    expect(result).toBe(RESULT)
    expect(received).toEqual({
      source: join(homedir(), "specs/api.yml"),
      silent: true,
      destination: {
        kind: "new",
        parentDir: join(homedir(), "collections"),
      },
    })
  })

  it("requires saved changes before importing into the current collection", async () => {
    let called = false
    await expect(
      runCollectionImport({
        values: {
          source: "/spec.yml",
          destination: "current",
          parentDir: "",
        },
        collectionDir: "/current",
        hasUnsavedChanges: true,
        pending: { current: false },
        runImport: async () => {
          called = true
          return RESULT
        },
      }),
    ).rejects.toThrow("Save all changes before importing into this collection")
    expect(called).toBe(false)
  })

  it("rejects creating a new collection inside the current collection", async () => {
    const collectionDir = await mkdtemp(join(tmpdir(), "noodle-import-test-"))
    const parentDir = join(collectionDir, "imports")
    await mkdir(parentDir)
    let called = false

    try {
      await expect(
        runCollectionImport({
          values: {
            source: "/spec.yml",
            destination: "new",
            parentDir,
          },
          collectionDir,
          hasUnsavedChanges: false,
          pending: { current: false },
          runImport: async () => {
            called = true
            return RESULT
          },
        }),
      ).rejects.toThrow("Choose a parent folder outside the current collection")
      expect(called).toBe(false)
    } finally {
      await rm(collectionDir, { recursive: true })
    }
  })

  it("ignores duplicate submissions while an import is pending", async () => {
    let called = false
    expect(
      await runCollectionImport({
        values: {
          source: "/spec.yml",
          destination: "new",
          parentDir: "/collections",
        },
        collectionDir: "/current",
        hasUnsavedChanges: false,
        pending: { current: true },
        runImport: async () => {
          called = true
          return RESULT
        },
      }),
    ).toBeNull()
    expect(called).toBe(false)
  })
})
