import { afterEach, describe, expect, it } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  collectionDisplayName,
  moveRegisteredCollection,
  resolveCollectionRegistration,
  unregisterCollection,
} from "../../src/ui/settings/collectionRegistry"

const dirs: string[] = []

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "noodle-registry-"))
  dirs.push(dir)
  return dir
}

function initialize(path: string): void {
  mkdirSync(join(path, ".environments"), { recursive: true })
}

afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true })
})

describe("collection registry settings", () => {
  it("uses collection metadata names with a path fallback", () => {
    expect(
      collectionDisplayName("/tmp/payments", { name: " Payments API " }),
    ).toBe("Payments API")
    expect(collectionDisplayName("/tmp/payments", { name: " " })).toBe(
      "payments",
    )
  })

  it("normalizes relative and @/ paths to initialized collections", () => {
    const root = workspace()
    const relative = join(root, "relative")
    const homeCollection = join(root, "home-collection")
    initialize(relative)
    initialize(homeCollection)

    expect(resolveCollectionRegistration("./relative", [], root, root)).toEqual(
      {
        ok: true,
        path: relative,
      },
    )
    expect(
      resolveCollectionRegistration("@/home-collection", [], root, root),
    ).toEqual({ ok: true, path: homeCollection })
  })

  it("rejects empty, uninitialized, invalid, and duplicate paths", () => {
    const root = workspace()
    const collection = join(root, "collection")
    const empty = join(root, "empty")
    initialize(collection)
    mkdirSync(empty)

    expect(resolveCollectionRegistration("", [], root, root)).toMatchObject({
      ok: false,
      error: expect.stringContaining("required"),
    })
    expect(
      resolveCollectionRegistration("./empty", [], root, root),
    ).toMatchObject({
      ok: false,
      error: expect.stringContaining("initialized"),
    })
    expect(
      resolveCollectionRegistration("./missing", [], root, root),
    ).toMatchObject({
      ok: false,
      error: expect.stringContaining("initialized"),
    })
    expect(
      resolveCollectionRegistration("./collection", [collection], root, root),
    ).toMatchObject({
      ok: false,
      error: expect.stringContaining("already registered"),
    })
  })

  it("reorders and unregisters without touching collection files", () => {
    const root = workspace()
    const active = join(root, "active")
    initialize(active)
    const paths = ["/a", active, "/c"]

    expect(moveRegisteredCollection(paths, 1, -1)).toEqual([active, "/a", "/c"])
    expect(moveRegisteredCollection(paths, 0, -1)).toBeNull()
    expect(unregisterCollection(paths, 1)).toEqual(["/a", "/c"])
    expect(existsSync(active)).toBe(true)
  })
})
