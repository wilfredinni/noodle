import { afterEach, expect, it } from "bun:test"
import { mkdtemp, mkdir, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { removeTestDirectory } from "../testCleanup"

const directories: string[] = []
afterEach(async () => {
  for (const directory of directories.splice(0))
    await removeTestDirectory(directory)
})

async function run(files: Record<string, string>, args: string[] = []) {
  const cwd = await mkdtemp(join(tmpdir(), "noodle-test-runner-"))
  directories.push(cwd)
  await mkdir(join(cwd, "tests", "nested"), { recursive: true })
  for (const [file, source] of Object.entries(files))
    await writeFile(join(cwd, "tests", file), source)
  const child = Bun.spawn(
    [
      process.execPath,
      resolve(import.meta.dir, "../../scripts/test.ts"),
      ...args,
    ],
    { cwd, stdout: "pipe", stderr: "pipe" },
  )
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ])
  return { exitCode, output: stdout + stderr }
}

it("runs every test file in a separate sequential process and forwards Bun flags", async () => {
  const source = `import { expect, it } from "bun:test"
import { appendFileSync } from "node:fs"
it("isolated", () => {
  expect(globalThis.__noodleTestFile).toBeUndefined()
  globalThis.__noodleTestFile = true
  appendFileSync("processes.txt", process.pid + "\\n")
})
it("filtered out", () => { throw Error("name filter was not forwarded") })`
  const result = await run(
    { "a.test.ts": source, "nested/b.test.tsx": source },
    ["--test-name-pattern=^isolated$"],
  )
  expect(result.exitCode).toBe(0)
  expect(result.output).toContain("[1/2] tests/a.test.ts")
  expect(result.output).toContain("[2/2] tests/nested/b.test.tsx")
  const pids = (
    await Bun.file(join(directories.at(-1)!, "processes.txt")).text()
  )
    .trim()
    .split("\n")
  expect(pids).toHaveLength(2)
  expect(new Set(pids).size).toBe(2)
})

it("retains failures and continues through the remaining files", async () => {
  const result = await run({
    "a.test.ts":
      'import { it } from "bun:test"; it("fails", () => { throw Error("fixture failure") })',
    "nested/b.test.ts":
      'import { it } from "bun:test"; it("still runs", () => {})',
  })
  expect(result.exitCode).not.toBe(0)
  expect(result.output).toContain("fixture failure")
  expect(result.output).toContain("still runs")
})

it("retains signal termination and continues through the remaining files", async () => {
  const result = await run({
    "a.test.ts":
      'import { it } from "bun:test"; it("terminates", () => { process.kill(process.pid, "SIGTERM") })',
    "nested/b.test.ts":
      'import { it } from "bun:test"; it("still runs", () => {})',
  })
  expect(result.exitCode).not.toBe(0)
  expect(result.output).toContain("still runs")
})

it("fails when no test files are discovered", async () => {
  const result = await run({})
  expect(result.exitCode).toBe(1)
  expect(result.output).toContain("No test files found")
})
