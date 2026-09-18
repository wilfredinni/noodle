import { afterEach, describe, expect, it, mock, spyOn } from "bun:test"
import {
  mkdtemp,
  mkdir,
  chmod,
  readFile,
  rm,
  rename,
  stat,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  openResponseFile,
  prepareResponseOutput,
  saveResponseFile,
  validateResponseOutput,
} from "../../src/responseFile"
import { responseFileNative } from "../../src/responseFileNative"

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
    const info = await stat(path)
    expect(info.isFile()).toBe(true)
    if (process.platform !== "win32") expect(info.mode & 0o777).toBe(0o600)
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
    const native = responseFileNative()
    const target = join(dir, "partial.bin")
    const failing = spyOn(native, "write").mockImplementation(async () => {
      throw new Error("disk full")
    })
    try {
      await expect(
        saveResponseFile(target, new Uint8Array([1])),
      ).rejects.toThrow("Unable to save response")
      expect(await stat(target).catch(() => null)).toBeNull()
    } finally {
      failing.mockRestore()
    }
    const racing = spyOn(native, "write").mockImplementation(async () => {
      await unlink(target)
      await writeFile(target, "other writer")
      throw new Error("interrupted")
    })
    try {
      await expect(
        saveResponseFile(target, new Uint8Array([1])),
      ).rejects.toThrow()
      expect(await readFile(target, "utf8")).toBe("other writer")
    } finally {
      racing.mockRestore()
    }
  })
  it("rejects injected missing parents and preserves intentional existing directory links", async () => {
    const dir = await directory()
    const attacker = join(dir, "attacker")
    await mkdir(attacker)
    const missing = join(dir, "missing")
    const output = await prepareResponseOutput(
      join(missing, "nested", "file.bin"),
    )
    try {
      await symlink(
        attacker,
        missing,
        process.platform === "win32" ? "junction" : "dir",
      )
      await expect(output.save(new Uint8Array([1]))).rejects.toThrow(
        "Unable to save response",
      )
      expect(await stat(join(attacker, "nested")).catch(() => null)).toBeNull()
    } finally {
      await output.close()
    }
    const actual = join(dir, "actual")
    await mkdir(actual)
    const alias = join(dir, "alias")
    await symlink(
      actual,
      alias,
      process.platform === "win32" ? "junction" : "dir",
    )
    const linked = await prepareResponseOutput(join(alias, "file.bin"))
    try {
      expect(await linked.save(new Uint8Array([1, 2]))).toBe(
        join(alias, "file.bin"),
      )
      expect(new Uint8Array(await readFile(join(actual, "file.bin")))).toEqual(
        new Uint8Array([1, 2]),
      )
    } finally {
      await linked.close()
    }
  })
  it("rejects a replacement of the selected existing directory before writing", async () => {
    const dir = await directory()
    const parent = join(dir, "selected")
    const attacker = join(dir, "attacker")
    await mkdir(parent)
    await mkdir(attacker)
    const output = await prepareResponseOutput(join(parent, "file.bin"))
    try {
      await rename(parent, join(dir, "original"))
      await symlink(
        attacker,
        parent,
        process.platform === "win32" ? "junction" : "dir",
      )
      await expect(output.save(new Uint8Array([1]))).rejects.toThrow(
        "Unable to save response",
      )
      expect(
        await stat(join(attacker, "file.bin")).catch(() => null),
      ).toBeNull()
      expect(
        await stat(join(dir, "original", "file.bin")).catch(() => null),
      ).toBeNull()
    } finally {
      await output.close()
    }
  })
  it("checks every new component while keeping the parent pinned during collision retries", async () => {
    const dir = await directory()
    const attacker = join(dir, "attacker")
    await mkdir(attacker)
    const output = await prepareResponseOutput(
      join(dir, "one", "two", "file.bin"),
    )
    const native = responseFileNative()
    const descend = native.descend.bind(native)
    const injected = spyOn(native, "descend").mockImplementationOnce(
      async (parent, name) => {
        const child = await descend(parent, name)
        await symlink(
          attacker,
          join(dir, "one", "two"),
          process.platform === "win32" ? "junction" : "dir",
        )
        return child
      },
    )
    try {
      await expect(output.save(new Uint8Array([1]))).rejects.toThrow(
        "Unable to save response",
      )
      expect(
        await stat(join(attacker, "file.bin")).catch(() => null),
      ).toBeNull()
    } finally {
      injected.mockRestore()
      await output.close()
    }
    const numbered = await prepareResponseOutput(join(dir, "file.bin"), {
      unique: true,
    })
    try {
      await writeFile(join(dir, "file.bin"), "other writer")
      expect(await numbered.save(new Uint8Array([2]))).toBe(
        join(dir, "file(1).bin"),
      )
      expect(await readFile(join(dir, "file.bin"), "utf8")).toBe("other writer")
    } finally {
      await numbered.close()
      await numbered.close()
    }
    await expect(numbered.save(new Uint8Array([3]))).rejects.toThrow(
      "closed or in use",
    )
  })
  it.skipIf(process.platform === "win32")(
    "retains write and search permission support without directory read permission",
    async () => {
      const dir = await directory()
      const parent = join(dir, "search-only")
      await mkdir(parent)
      await chmod(parent, 0o300)
      try {
        await saveResponseFile(join(parent, "file.bin"), new Uint8Array([4]))
        expect(
          new Uint8Array(await readFile(join(parent, "file.bin"))),
        ).toEqual(new Uint8Array([4]))
      } finally {
        await chmod(parent, 0o700)
      }
    },
  )
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
