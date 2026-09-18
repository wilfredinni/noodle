import { afterEach, describe, expect, it, mock, spyOn } from "bun:test"
import {
  mkdtemp,
  open,
  readFile,
  rm,
  stat,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  openResponseFile,
  saveResponseFile,
  validateResponseOutput,
} from "../../src/responseFile"

const dirs: string[] = []
async function directory() {
  const dir = await mkdtemp(join(tmpdir(), "noodle-response-file-"))
  dirs.push(dir)
  return dir
}
afterEach(async () => {
  for (const dir of dirs.splice(0))
    await rm(dir, { recursive: true, force: true })
})
describe("response files", () => {
  it("creates parents, saves exact bytes privately, and never overwrites files or symlinks", async () => {
    const dir = await directory()
    const path = await validateResponseOutput(join(dir, "nested", "file.bin"))
    const bytes = new Uint8Array([0, 255, 27, 128])
    await saveResponseFile(path, bytes)
    expect(new Uint8Array(await readFile(path))).toEqual(bytes)
    expect((await stat(path)).mode & 0o777).toBe(0o600)
    await expect(validateResponseOutput(path)).rejects.toThrow("already exists")
    await expect(saveResponseFile(path, new Uint8Array([1]))).rejects.toThrow()
    const link = join(dir, "link.bin")
    await symlink(path, link)
    await expect(validateResponseOutput(link)).rejects.toThrow("already exists")
    await expect(saveResponseFile(link, new Uint8Array([1]))).rejects.toThrow()
    expect(new Uint8Array(await readFile(path))).toEqual(bytes)
  })
  it("removes its partial file after a write failure and preserves a replacement from another writer", async () => {
    const dir = await directory()
    const handle = await open(join(dir, "prototype"), "w")
    const prototype = Object.getPrototypeOf(handle)
    await handle.close()
    const target = join(dir, "partial.bin")
    const failing = spyOn(prototype, "writeFile").mockImplementation(
      async () => {
        throw new Error("disk full")
      },
    )
    try {
      await expect(
        saveResponseFile(target, new Uint8Array([1])),
      ).rejects.toThrow("Unable to save response")
      expect(await stat(target).catch(() => null)).toBeNull()
    } finally {
      failing.mockRestore()
    }
    const racing = spyOn(prototype, "writeFile").mockImplementation(
      async () => {
        await unlink(target)
        await writeFile(target, "other writer")
        throw new Error("interrupted")
      },
    )
    try {
      await expect(
        saveResponseFile(target, new Uint8Array([1])),
      ).rejects.toThrow()
      expect(await readFile(target, "utf8")).toBe("other writer")
    } finally {
      racing.mockRestore()
    }
  })
  it("passes a saved absolute path as one argument to the platform opener and reports failures", async () => {
    const path = join(await directory(), "file $(command); 'quoted'.png")
    const spawn = mock((_command: string[], _options: unknown) => ({
      exited: Promise.resolve(0),
    }))
    await openResponseFile(path, spawn as unknown as typeof Bun.spawn)
    expect(spawn.mock.calls[0]![0]).toEqual([
      process.platform === "darwin"
        ? "open"
        : process.platform === "win32"
          ? "explorer.exe"
          : "xdg-open",
      path,
    ])
    await expect(
      openResponseFile(
        path,
        mock(() => ({
          exited: Promise.resolve(1),
        })) as unknown as typeof Bun.spawn,
      ),
    ).rejects.toThrow("Unable to open")
  })
})
