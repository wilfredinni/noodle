import { afterEach, beforeAll, beforeEach, expect, it, spyOn } from "bun:test"
import { randomUUID } from "node:crypto"
import * as fs from "node:fs/promises"
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  utimes,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { acquireFileLock } from "../../src/fileLock"

const timing = { lockTimeoutMs: 0, minBackoffMs: 0, maxBackoffMs: 0 }
let directory: string
let deadPid: number
const platform = process.platform

beforeAll(async () => {
  const child = Bun.spawn([process.execPath, "-e", "process.exit(0)"], {
    stdout: "ignore",
    stderr: "ignore",
  })
  expect(await child.exited).toBe(0)
  deadPid = child.pid
})

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "noodle-lock-"))
})

afterEach(async () => {
  Object.defineProperty(process, "platform", { value: platform })
  await rm(directory, { recursive: true, force: true })
})

it("retries Windows mkdir EPERM until the released lock directory is available", async () => {
  Object.defineProperty(process, "platform", { value: "win32" })
  const file = join(directory, "cookies.json")
  const realMkdir = fs.mkdir
  let attempts = 0
  const createDirectory = spyOn(fs, "mkdir").mockImplementation(
    async (path, options) => {
      if (String(path) === `${file}.lock` && ++attempts < 3)
        throw Object.assign(new Error("Directory is pending deletion"), {
          code: "EPERM",
          syscall: "mkdir",
        })
      await realMkdir(path, options)
      return undefined
    },
  )
  let lock: Awaited<ReturnType<typeof acquireFileLock>> | undefined
  try {
    lock = await acquireFileLock(file, { ...timing, lockTimeoutMs: 1000 })
    expect(attempts).toBe(3)
    expect(await readFile(join(`${file}.lock`, "owner"), "utf8")).toStartWith(
      `${process.pid}:`,
    )
  } finally {
    createDirectory.mockRestore()
    await lock?.release()
  }
})

it.each([
  ["win32", "EPERM", "lock-timeout"],
  ["darwin", "EPERM", "write"],
  ["win32", "EIO", "write"],
])("bounds or rejects %s mkdir %s as %s", async (platform, code, expected) => {
  Object.defineProperty(process, "platform", { value: platform })
  const file = join(directory, "cookies.json")
  const error = Object.assign(new Error("Injected mkdir failure"), {
    code,
    syscall: "mkdir",
  })
  const realMkdir = fs.mkdir
  const createDirectory = spyOn(fs, "mkdir").mockImplementation(
    async (path, options) => {
      if (String(path) === `${file}.lock`) throw error
      await realMkdir(path, options)
      return undefined
    },
  )
  try {
    await expect(acquireFileLock(file, timing)).rejects.toMatchObject({
      code: expected,
      ...(expected === "write" ? { cause: error } : {}),
    })
    expect(await readdir(directory)).toEqual([])
  } finally {
    createDirectory.mockRestore()
  }
})

it("preserves Windows owner-write EPERM and cleans up the unclaimed lock", async () => {
  Object.defineProperty(process, "platform", { value: "win32" })
  const file = join(directory, "cookies.json")
  const error = Object.assign(new Error("Injected owner-write failure"), {
    code: "EPERM",
    syscall: "open",
  })
  const writeOwner = spyOn(fs, "writeFile").mockRejectedValue(error)
  try {
    await expect(acquireFileLock(file, timing)).rejects.toMatchObject({
      code: "write",
      cause: error,
    })
    expect(writeOwner).toHaveBeenCalledTimes(1)
    expect(await readdir(directory)).toEqual([])
  } finally {
    writeOwner.mockRestore()
  }
})

async function abandon(file: string) {
  const owner = `${deadPid}:${randomUUID()}`
  await mkdir(`${file}.lock`)
  await writeFile(join(`${file}.lock`, "owner"), owner)
  return owner
}

it("recovers an opted-in dead owner's lock without changing protected data", async () => {
  const file = join(directory, "cookies.json")
  await writeFile(file, "preserved encrypted cookies")
  const owner = await abandon(file)
  const lock = await acquireFileLock(file, {
    ...timing,
    recoverDeadOwner: true,
  })
  try {
    expect(await readFile(file, "utf8")).toBe("preserved encrypted cookies")
    expect(
      await readFile(
        `${file}.lock.abandoned-${owner.replace(":", "-")}/owner`,
        "utf8",
      ),
    ).toBe(owner)
    expect(await readFile(join(`${file}.lock`, "owner"), "utf8")).not.toBe(
      owner,
    )
  } finally {
    await lock.release()
  }
})

it("bounds recovery retries while retaining one immediate recovery attempt", async () => {
  const file = join(directory, "cookies.json")
  await abandon(file)
  const rename = fs.rename
  let recoveries = 0
  const competingWriter = spyOn(fs, "rename").mockImplementation(
    async (from, to) => {
      await rename(from, to)
      if (from === `${file}.lock` && ++recoveries < 3) await abandon(file)
    },
  )
  try {
    await expect(
      acquireFileLock(file, { ...timing, recoverDeadOwner: true }),
    ).rejects.toMatchObject({ code: "lock-timeout" })
    expect(recoveries).toBe(1)
  } finally {
    competingWriter.mockRestore()
  }
})

it("keeps abandoned locks when recovery has not been explicitly enabled", async () => {
  const file = join(directory, ".mutation")
  const owner = await abandon(file)
  await expect(acquireFileLock(file, timing)).rejects.toMatchObject({
    code: "lock-timeout",
  })
  expect(await readFile(join(`${file}.lock`, "owner"), "utf8")).toBe(owner)
})

it("never reclaims an aged lock held by a living process", async () => {
  const file = join(directory, "cookies.json")
  const lock = await acquireFileLock(file, timing)
  const ownerFile = join(`${file}.lock`, "owner")
  const owner = await readFile(ownerFile, "utf8")
  const old = new Date(0)
  await utimes(`${file}.lock`, old, old)
  try {
    await expect(
      acquireFileLock(file, { ...timing, recoverDeadOwner: true }),
    ).rejects.toMatchObject({ code: "lock-timeout" })
    expect(await readFile(ownerFile, "utf8")).toBe(owner)
    expect(await readdir(directory)).toEqual(["cookies.json.lock"])
  } finally {
    await lock.release()
  }
})

it.each(["", "unknown", "0", "-1", "2147483648", "1:../../elsewhere"])(
  "preserves unrecognized ownership metadata: %s",
  async (pid) => {
    const file = join(directory, "cookies.json")
    const owner = `${pid}:${randomUUID()}`
    await mkdir(`${file}.lock`)
    await writeFile(join(`${file}.lock`, "owner"), owner)
    await expect(
      acquireFileLock(file, { ...timing, recoverDeadOwner: true }),
    ).rejects.toMatchObject({ code: "lock-timeout" })
    expect(await readFile(join(`${file}.lock`, "owner"), "utf8")).toBe(owner)
  },
)

it("preserves a lock whose owner file has not been written yet", async () => {
  const file = join(directory, "cookies.json")
  await mkdir(`${file}.lock`)
  await expect(
    acquireFileLock(file, { ...timing, recoverDeadOwner: true }),
  ).rejects.toMatchObject({ code: "lock-timeout" })
  expect(await readdir(`${file}.lock`)).toEqual([])
})

it("rejects trailing data in an otherwise valid owner token", async () => {
  const file = join(directory, "cookies.json")
  const owner = `${await abandon(file)}\n`
  await writeFile(join(`${file}.lock`, "owner"), owner)
  await expect(
    acquireFileLock(file, { ...timing, recoverDeadOwner: true }),
  ).rejects.toMatchObject({ code: "lock-timeout" })
  expect(await readFile(join(`${file}.lock`, "owner"), "utf8")).toBe(owner)
})

it("preserves unexpected lock contents even when the owner is dead", async () => {
  const file = join(directory, "cookies.json")
  const owner = await abandon(file)
  await writeFile(join(`${file}.lock`, "unexpected"), "preserved")
  await expect(
    acquireFileLock(file, { ...timing, recoverDeadOwner: true }),
  ).rejects.toMatchObject({ code: "lock-timeout" })
  expect(await readFile(join(`${file}.lock`, "owner"), "utf8")).toBe(owner)
  expect(await readFile(join(`${file}.lock`, "unexpected"), "utf8")).toBe(
    "preserved",
  )
})

it("preserves locks when process liveness cannot be checked", async () => {
  const file = join(directory, "cookies.json")
  const owner = await abandon(file)
  const kill = spyOn(process, "kill").mockImplementation(() => {
    throw Object.assign(new Error("Permission denied"), { code: "EPERM" })
  })
  try {
    await expect(
      acquireFileLock(file, { ...timing, recoverDeadOwner: true }),
    ).rejects.toMatchObject({ code: "lock-timeout" })
    expect(await readFile(join(`${file}.lock`, "owner"), "utf8")).toBe(owner)
  } finally {
    kill.mockRestore()
  }
})

it.skipIf(process.platform === "win32")(
  "does not follow lock or owner symlinks",
  async () => {
    const target = join(directory, "target")
    await mkdir(target)
    const owner = `${deadPid}:${randomUUID()}`
    await writeFile(join(target, "owner"), owner)
    const file = join(directory, "cookies.json")
    await symlink(target, `${file}.lock`)
    await expect(
      acquireFileLock(file, { ...timing, recoverDeadOwner: true }),
    ).rejects.toMatchObject({ code: "lock-timeout" })
    await rm(`${file}.lock`)
    await mkdir(`${file}.lock`)
    await symlink(join(target, "owner"), join(`${file}.lock`, "owner"))
    await expect(
      acquireFileLock(file, { ...timing, recoverDeadOwner: true }),
    ).rejects.toMatchObject({ code: "lock-timeout" })
    expect(await readFile(join(target, "owner"), "utf8")).toBe(owner)
  },
)

it("a delayed competing recovery cannot move a replacement owner's lock", async () => {
  const file = join(directory, "cookies.json")
  const owner = await abandon(file)
  const firstRename = Promise.withResolvers<void>()
  const secondRename = Promise.withResolvers<void>()
  const resumeSecond = Promise.withResolvers<void>()
  const rename = fs.rename
  let attempts = 0
  const delayedRename = spyOn(fs, "rename").mockImplementation(
    async (from, to) => {
      if (from === `${file}.lock`) {
        if (++attempts === 1) {
          firstRename.resolve()
          await secondRename.promise
        } else {
          secondRename.resolve()
          await resumeSecond.promise
        }
      }
      return rename(from, to)
    },
  )
  const first = acquireFileLock(file, { ...timing, recoverDeadOwner: true })
  await firstRename.promise
  const second = acquireFileLock(file, { ...timing, recoverDeadOwner: true })
  const secondOutcome = second.then(
    (lock) => ({ lock }),
    (error: unknown) => ({ error }),
  )
  let holder: Awaited<typeof first> | undefined
  try {
    await secondRename.promise
    holder = await first
    const replacement = await readFile(join(`${file}.lock`, "owner"), "utf8")
    resumeSecond.resolve()
    expect(await secondOutcome).toMatchObject({
      error: { code: "lock-timeout" },
    })
    expect(await readFile(join(`${file}.lock`, "owner"), "utf8")).toBe(
      replacement,
    )
    expect(
      await readFile(
        `${file}.lock.abandoned-${owner.replace(":", "-")}/owner`,
        "utf8",
      ),
    ).toBe(owner)
  } finally {
    secondRename.resolve()
    resumeSecond.resolve()
    await Promise.allSettled([first, second])
    delayedRename.mockRestore()
    await holder?.release()
  }
})

it("serializes processes recovering a lock left by a killed writer", async () => {
  const file = join(directory, "cookies.json")
  await writeFile(file, "preserved encrypted cookies")
  const fixture = resolve(import.meta.dir, "../fixtures/file-lock-process.ts")
  const spawn = () =>
    Bun.spawn([process.execPath, fixture, file], {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    })
  const killed = spawn()
  const children = [killed]
  const ready = async (child: ReturnType<typeof spawn>) => {
    const reader = child.stdout.getReader()
    try {
      const message = await reader.read()
      expect(new TextDecoder().decode(message.value)).toBe("locked\n")
    } finally {
      reader.releaseLock()
    }
  }
  try {
    await ready(killed)
    const owner = await readFile(join(`${file}.lock`, "owner"), "utf8")
    killed.kill("SIGKILL")
    await killed.exited
    const contenders = [spawn(), spawn(), spawn()]
    children.push(...contenders)
    await Promise.all(
      contenders.map(async (child) => {
        await ready(child)
        expect(
          await readFile(join(`${file}.lock`, "owner"), "utf8"),
        ).toStartWith(`${child.pid}:`)
        await expect(
          acquireFileLock(file, { ...timing, recoverDeadOwner: true }),
        ).rejects.toMatchObject({ code: "lock-timeout" })
        child.stdin.end()
        expect(await child.exited).toBe(0)
        expect(await new Response(child.stderr).text()).toBe("")
      }),
    )
    expect(await readFile(file, "utf8")).toBe("preserved encrypted cookies")
    expect(
      await readFile(
        `${file}.lock.abandoned-${owner.replace(":", "-")}/owner`,
        "utf8",
      ),
    ).toBe(owner)
  } finally {
    for (const child of children) child.kill()
    await Promise.all(children.map((child) => child.exited))
  }
})
