import { afterEach, beforeEach, expect, it, spyOn } from "bun:test"
import * as fs from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  prepareResponseOutput,
  validateResponseOutput,
} from "../../src/responseFile"
import { responseFileNative } from "../../src/responseFileNative"

let dir: string
beforeEach(async () => {
  dir = await fs.mkdtemp(join(tmpdir(), "noodle-report-"))
})
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true })
})
const bytes = (text: string) => new TextEncoder().encode(text)
async function save(path: string, text: string) {
  const output = await prepareResponseOutput(path, { atomic: true })
  try {
    await output.save(bytes(text))
  } finally {
    await output.close()
  }
}

it("validates native path components and snapshots bytes before asynchronous publication", async () => {
  const native = responseFileNative()
  const anchor = await native.openAnchor(dir)
  try {
    for (const name of [
      "../escape",
      "a/b",
      "",
      ".",
      "..",
      "a\0b",
      ...(process.platform === "win32" ? ["a\\b", "a:b"] : []),
    ]) {
      expect(() =>
        native.writeReport(anchor, name, "staging", bytes("report")),
      ).toThrow()
      expect(() =>
        native.writeReport(anchor, "result.xml", name, bytes("report")),
      ).toThrow()
    }
    const content = bytes("original")
    const writing = native.writeReport(anchor, "result.xml", "staging", content)
    content.fill(0)
    expect(() => native.close(anchor)).toThrow("in use")
    await writing
    expect(await fs.readFile(join(dir, "result.xml"), "utf8")).toBe("original")
    expect(await fs.readdir(dir)).toEqual(["result.xml"])
  } finally {
    native.close(anchor)
  }
})

it("publishes complete private reports, creates parents, and refuses existing files and symlinks", async () => {
  const destination = join(dir, "nested", "result.xml")
  await save(destination, "<testsuites/>\n")
  expect(await fs.readFile(destination, "utf8")).toBe("<testsuites/>\n")
  if (process.platform !== "win32")
    expect((await fs.stat(destination)).mode & 0o777).toBe(0o600)
  await expect(validateResponseOutput(destination)).rejects.toThrow(
    "Output already exists",
  )
  await expect(save(destination, "replacement")).rejects.toThrow(
    "Output already exists",
  )
  const symlink = join(dir, "linked.xml")
  await fs.symlink(destination, symlink)
  await expect(save(symlink, "replacement")).rejects.toThrow(
    "Output already exists",
  )
  expect(await fs.readFile(destination, "utf8")).toBe("<testsuites/>\n")
  expect(await fs.readdir(join(dir, "nested"))).toEqual(["result.xml"])
  expect((await fs.readdir(dir)).sort()).toEqual(["linked.xml", "nested"])
})

it.skipIf(process.platform === "win32")(
  "cleans up when opening staging exhausts file descriptors",
  async () => {
    const child = Bun.spawnSync([
      "sh",
      "-c",
      'ulimit -n 128 && exec "$@"',
      "sh",
      process.execPath,
      "-e",
      `import { openSync } from "node:fs"
     import { responseFileNative } from "./src/responseFileNative"
     const native = responseFileNative()
     const anchor = await native.openAnchor(process.argv[1])
     try {
       for (;;) openSync("/dev/null", "r")
     } catch (error) { if (error.code !== "EMFILE") throw error }
     try {
       await native.writeReport(anchor, "result.xml", "staging", new Uint8Array())
       throw Error("expected writeReport to fail")
     } catch (error) { if (error.code !== "EMFILE") throw error }`,
      dir,
    ])
    expect(child.stderr.toString()).toBe("")
    expect(child.exitCode).toBe(0)
    expect(await fs.readdir(dir)).toEqual([])
  },
)

it("leaves no partial report after native writing fails", async () => {
  const native = responseFileNative()
  const failing = spyOn(native, "writeReport").mockRejectedValue(
    new Error("disk full"),
  )
  try {
    await expect(save(join(dir, "result.json"), "report")).rejects.toThrow(
      "Unable to save response",
    )
    expect(await fs.readdir(dir)).toEqual([])
  } finally {
    failing.mockRestore()
  }
})

it("cleans complete staging data after publication collides with another writer", async () => {
  const destination = join(dir, "result.xml")
  const output = await prepareResponseOutput(destination, { atomic: true })
  try {
    await fs.writeFile(destination, "another writer")
    await expect(output.save(bytes("complete report"))).rejects.toThrow()
    expect(await fs.readFile(destination, "utf8")).toBe("another writer")
    expect(await fs.readdir(dir)).toEqual(["result.xml"])
  } finally {
    await output.close()
  }
})

it("rejects parent replacement and missing-directory symlink injection after preparation", async () => {
  const parent = join(dir, "parent")
  const other = join(dir, "other")
  await fs.mkdir(parent)
  await fs.mkdir(other)
  const output = await prepareResponseOutput(join(parent, "result.xml"), {
    atomic: true,
  })
  const missing = await prepareResponseOutput(
    join(dir, "missing", "result.xml"),
    { atomic: true },
  )
  try {
    await fs.rename(parent, join(dir, "original"))
    const type = process.platform === "win32" ? "junction" : "dir"
    await fs.symlink(other, parent, type)
    await fs.symlink(other, join(dir, "missing"), type)
    await expect(output.save(bytes("private report"))).rejects.toThrow(
      "Unable to save response",
    )
    await expect(missing.save(bytes("private report"))).rejects.toThrow(
      "Unable to save response",
    )
    expect(await fs.readdir(other)).toEqual([])
    expect(await fs.readdir(join(dir, "original"))).toEqual([])
  } finally {
    await output.close()
    await missing.close()
  }
})

it("keeps publication in the pinned directory even if its path changes after validation", async () => {
  const parent = join(dir, "parent")
  const original = join(dir, "original")
  const other = join(dir, "other")
  await fs.mkdir(parent)
  await fs.mkdir(other)
  const output = await prepareResponseOutput(join(parent, "result.xml"), {
    atomic: true,
  })
  const native = responseFileNative()
  const write = native.writeReport.bind(native)
  const racing = spyOn(native, "writeReport").mockImplementation(
    async (...args) => {
      await fs.rename(parent, original)
      await fs.symlink(
        other,
        parent,
        process.platform === "win32" ? "junction" : "dir",
      )
      return write(...args)
    },
  )
  try {
    await output.save(bytes("private report"))
    expect(await fs.readdir(other)).toEqual([])
    expect(await fs.readFile(join(original, "result.xml"), "utf8")).toBe(
      "private report",
    )
  } finally {
    racing.mockRestore()
    await output.close()
  }
})

it("refuses a substituted staging name without publishing unrelated local data", async () => {
  const native = responseFileNative()
  const anchor = await native.openAnchor(dir)
  await fs.writeFile(join(dir, "private.txt"), "private local data")
  await fs.symlink(join(dir, "private.txt"), join(dir, "staging"))
  try {
    await expect(
      native.writeReport(anchor, "result.xml", "staging", bytes("report")),
    ).rejects.toThrow()
    expect(await fs.readFile(join(dir, "private.txt"), "utf8")).toBe(
      "private local data",
    )
    expect((await fs.readdir(dir)).sort()).toEqual(["private.txt", "staging"])
  } finally {
    native.close(anchor)
  }
})
