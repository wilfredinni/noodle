import { afterEach, beforeEach, expect, it, spyOn } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { CommandDef } from "citty"
import { collection } from "../../src/app/commands/automation"

const command = process.env.NOODLE_TEST_BINARY
  ? [process.env.NOODLE_TEST_BINARY]
  : [process.execPath, "src/app/cli.ts"]
let dir: string
let server: ReturnType<typeof Bun.serve>
let entered: ReturnType<typeof Promise.withResolvers<void>>
let release: ReturnType<typeof Promise.withResolvers<void>>
let child: Bun.Subprocess<"ignore", "pipe", "pipe"> | undefined
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "noodle-cancel-cli-"))
  entered = Promise.withResolvers<void>()
  release = Promise.withResolvers<void>()
  server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: async (req) => {
      if (new URL(req.url).pathname === "/hold") {
        entered.resolve()
        await release.promise
      }
      return Response.json({ id: 7 })
    },
  })
  await writeFile(join(dir, "settings.yml"), "cookies:\n  enabled: false\n")
  for (const [id, path] of [
    ["a", "ok"],
    ["b", "hold"],
    ["c", "ok"],
  ])
    await writeFile(
      join(dir, `${id}.yml`),
      `name: ${id}\nmethod: GET\nurl: http://127.0.0.1:${server.port}/${path}\ntimeout: 0\n`,
    )
})
afterEach(async () => {
  if (child && child.exitCode === null) {
    child.kill()
    await child.exited
  }
  child = undefined
  release.resolve()
  server.stop(true)
  await rm(dir, { recursive: true, force: true })
})
// Windows subprocess.kill() force-terminates; emitted signals below test handlers.
const signalTest = it.skipIf(process.platform === "win32")
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  signalTest(`returns partial JSON and exits 130 on ${signal}`, async () => {
    child = Bun.spawn(
      [...command, "collection", "run", dir, "--noproxy", "--json"],
      {
        stdout: "pipe",
        stderr: "pipe",
        env: { ...process.env, NO_COLOR: "1" },
      },
    )
    await entered.promise
    child.kill(signal)
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ])
    expect(code).toBe(130)
    expect(stderr).toBe("")
    const envelope = JSON.parse(stdout)
    expect(envelope).toMatchObject({
      status: "error",
      errors: ["Collection run cancelled"],
      data: {
        cancelled: true,
        results: [
          { id: "a", ok: true },
          { id: "b", cancelled: true },
        ],
        skipped: [{ id: "c", reason: "cancelled" }],
        summary: { completed: 1, cancelled: 1, unstarted: 1 },
      },
    })
    expect(stdout.trim().split("\n")).toHaveLength(1)
  })
}
signalTest("prints partial human output on interruption", async () => {
  child = Bun.spawn([...command, "collection", "run", dir, "--noproxy"], {
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, NO_COLOR: "1" },
  })
  await entered.promise
  child.kill("SIGINT")
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  expect(code).toBe(130)
  expect(stderr).toBe("")
  expect(stdout).toContain(
    "Cancellation: 1 completed, 1 cancelled, 1 unstarted",
  )
  expect(stdout).toContain("skipped (cancelled)")
  expect(stdout).not.toContain("script failure")
})
it("removes signal listeners on success and configuration failure", async () => {
  const subCommands = collection.subCommands as { run: CommandDef }
  const run = subCommands.run
  const before = [
    process.listenerCount("SIGINT"),
    process.listenerCount("SIGTERM"),
  ]
  const exitCode = process.exitCode
  const stdout = process.stdout.write
  const outputs: string[] = []
  process.stdout.write = ((text: string) => {
    outputs.push(text)
    return true
  }) as typeof stdout
  try {
    for (const path of [dir, join(dir, "missing")]) {
      await run.run!({
        args: { _: [path, "a"], path, json: true, noproxy: true, delay: "0" },
        rawArgs: [path, "a", "--json"],
      } as never)
      expect([
        process.listenerCount("SIGINT"),
        process.listenerCount("SIGTERM"),
      ]).toEqual(before)
    }
    expect(JSON.parse(outputs[0]!).status).toBe("success")
    expect(JSON.parse(outputs[1]!).status).toBe("error")
    expect(process.exitCode).toBe(2)
  } finally {
    process.stdout.write = stdout
    process.exitCode = exitCode ?? 0
  }
})

for (const [signal, json] of [
  ["SIGINT", true],
  ["SIGTERM", true],
  ["SIGINT", false],
  ["SIGTERM", false],
] as const) {
  it(`returns partial ${json ? "JSON" : "human"} output on emitted ${signal} and force-exits on a repeat signal`, async () => {
    const run = (collection.subCommands as { run: CommandDef }).run
    const exitCode = process.exitCode
    const stdout = process.stdout.write
    const stderr = process.stderr.write
    const tty = Object.getOwnPropertyDescriptor(process.stderr, "isTTY")
    Object.defineProperty(process.stderr, "isTTY", {
      value: true,
      configurable: true,
    })
    const outputs: string[] = []
    const progress: string[] = []
    let progressAtExit = ""
    const before = [
      process.listenerCount("SIGINT"),
      process.listenerCount("SIGTERM"),
    ]
    const exit = spyOn(process, "exit").mockImplementation(() => {
      progressAtExit = progress.join("")
      throw new Error("forced exit")
    })
    process.stdout.write = ((text: string) => {
      outputs.push(text)
      return true
    }) as typeof stdout
    process.stderr.write = ((text: string) => {
      progress.push(text)
      return true
    }) as typeof stderr
    const pending = run.run!({
      args: { _: [dir], path: dir, json, noproxy: true, delay: "0" },
      rawArgs: [dir],
    } as never)
    try {
      await entered.promise
      process.emit(signal)
      expect(exit).not.toHaveBeenCalled()
      const repeat = signal === "SIGINT" ? "SIGTERM" : "SIGINT"
      expect(() => process.emit(repeat)).toThrow("forced exit")
      expect(exit).toHaveBeenCalledWith(130)
      if (json) expect(progressAtExit).toBe("")
      else {
        expect(progressAtExit).toContain("Running requests")
        expect(progressAtExit.endsWith("\r\x1b[2K")).toBeTrue()
      }
      await pending
      // Mocked exit lets cancellation settle and report progress once more.
      if (json) expect(progress).toEqual([])
      else expect(progress.join("").endsWith("\r\x1b[2K")).toBeTrue()
      expect(process.exitCode).toBe(130)
      expect([
        process.listenerCount("SIGINT"),
        process.listenerCount("SIGTERM"),
      ]).toEqual(before)
      expect(outputs).toHaveLength(1)
      if (json)
        expect(JSON.parse(outputs[0]!)).toMatchObject({
          status: "error",
          errors: ["Collection run cancelled"],
          data: {
            cancelled: true,
            results: [
              { id: "a", ok: true },
              { id: "b", cancelled: true },
            ],
            skipped: [{ id: "c", reason: "cancelled" }],
            summary: { completed: 1, cancelled: 1, unstarted: 1 },
          },
        })
      else
        expect(outputs[0]).toContain(
          "Cancellation: 1 completed, 1 cancelled, 1 unstarted",
        )
    } finally {
      await pending
      exit.mockRestore()
      process.stdout.write = stdout
      process.stderr.write = stderr
      if (tty) Object.defineProperty(process.stderr, "isTTY", tty)
      else Reflect.deleteProperty(process.stderr, "isTTY")
      process.exitCode = exitCode ?? 0
    }
  })
}
