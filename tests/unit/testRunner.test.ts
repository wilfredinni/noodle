import { afterEach, expect, it } from "bun:test"
import { mkdtemp, mkdir, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { removeTestDirectory } from "../testCleanup"

const directories: string[] = []
afterEach(async () => {
  for (const directory of directories.splice(0))
    await removeTestDirectory(directory)
})

async function run(
  files: Record<string, string>,
  args: string[] = [],
  platform: "linux" | "darwin" | "win32" = "linux",
  preload = "",
) {
  const cwd = await mkdtemp(join(tmpdir(), "noodle-test-runner-"))
  directories.push(cwd)
  await mkdir(join(cwd, "tests"), { recursive: true })
  for (const [file, source] of Object.entries(files)) {
    const path = join(cwd, "tests", file)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, source)
  }
  const preloadPath = join(cwd, "platform.ts")
  await writeFile(
    preloadPath,
    `Object.defineProperty(process, "platform", { value: ${JSON.stringify(platform)} });
${preload}`,
  )
  const child = Bun.spawn(
    [
      process.execPath,
      "--preload",
      preloadPath,
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

it.each(["linux", "win32"] as const)(
  "runs every file in a separate process and forwards Bun flags on %s",
  async (platform) => {
    const source = `import { expect, it } from "bun:test"
import { appendFileSync } from "node:fs"
it("isolated", () => {
  expect(globalThis.__noodleTestFile).toBeUndefined()
  globalThis.__noodleTestFile = true
  appendFileSync("processes.txt", process.pid + "\\n")
})
it("filtered out", () => { throw Error("name filter was not forwarded") })`
    const result = await run(
      { "unit/a.test.ts": source, "unit/b.test.tsx": source },
      ["--test-name-pattern=^isolated$"],
      platform,
    )
    expect(result.exitCode).toBe(0)
    expect(result.output).toContain(
      `[1/2] ${join("tests", "unit", "a.test.ts")}`,
    )
    expect(result.output).toContain(
      `[2/2] ${join("tests", "unit", "b.test.tsx")}`,
    )
    const pids = (
      await Bun.file(join(directories.at(-1)!, "processes.txt")).text()
    )
      .trim()
      .split("\n")
    expect(pids).toHaveLength(2)
    expect(new Set(pids).size).toBe(2)
  },
)

it.each(["linux", "win32"] as const)(
  "retains failures and runs every remaining file on %s",
  async (platform) => {
    const result = await run(
      {
        "unit/a.test.ts":
          'import { it } from "bun:test"; it("fails", () => { throw Error("fixture failure") })',
        "unit/b.test.ts":
          'import { it } from "bun:test"; it("still runs", () => {})',
      },
      [],
      platform,
    )
    expect(result.exitCode).not.toBe(0)
    expect(result.output).toContain("fixture failure")
    expect(result.output).toContain("still runs")
  },
)

it.each(["linux", "win32"] as const)(
  "retains signal termination and runs every remaining file on %s",
  async (platform) => {
    const result = await run(
      {
        "unit/a.test.ts":
          'import { it } from "bun:test"; it("terminates", () => { process.kill(process.pid, "SIGTERM") })',
        "unit/b.test.ts":
          'import { it } from "bun:test"; it("still runs", () => {})',
      },
      [],
      platform,
    )
    expect(result.exitCode).not.toBe(0)
    expect(result.output).toContain("still runs")
  },
)

it.each(["linux", "win32"] as const)(
  "fails when no test files are discovered on %s",
  async (platform) => {
    const result = await run({}, [], platform)
    expect(result.exitCode).toBe(1)
    expect(result.output).toContain("No test files found")
  },
)

it.each(["linux", "darwin", "win32"] as const)(
  "bounds concurrent files and keeps system tests exclusive on %s",
  async (platform) => {
    const files = Object.fromEntries(
      [
        "install-powershell.test.ts",
        "integration/windowsUpdate.test.ts",
        "integration/asyncScripts.test.ts",
        "unit/a.test.ts",
        "unit/b.test.ts",
        "unit/c.test.ts",
        "unit/clipboard.test.ts",
        "unit/externalEditor.test.ts",
        "unit/testRunner.test.ts",
        "unit/update.test.ts",
        "unit/useUpdateFlow.test.tsx",
        "unit/windows-update.test.ts",
      ].map((file) => [file, ""]),
    )
    const result = await run(
      files,
      [],
      platform,
      `
      const active = new Set();
      const starts = [];
      let maximum = 0;
      function start(command) {
        const file = command[2].replaceAll("\\\\", "/");
        active.add(file);
        maximum = Math.max(maximum, active.size);
        starts.push({ file, active: [...active] });
        return file;
      }
      Bun.spawnSync = (command) => {
        const file = start(command);
        active.delete(file);
        return { success: true };
      };
      Bun.spawn = (command) => {
        const file = start(command);
        return { exited: new Promise((resolve) => queueMicrotask(() => {
          active.delete(file);
          resolve(0);
        })) };
      };
      process.on("exit", () => console.log("SCHEDULE " + JSON.stringify({ maximum, starts })));
    `,
    )
    expect(result.exitCode).toBe(0)
    const line = result.output
      .split("\n")
      .find((line) => line.startsWith("SCHEDULE "))!
    const schedule = JSON.parse(line.slice("SCHEDULE ".length)) as {
      maximum: number
      starts: { file: string; active: string[] }[]
    }
    expect(schedule.maximum).toBe(platform === "win32" ? 2 : 1)
    expect(schedule.starts.map(({ file }) => file).sort()).toEqual(
      Object.keys(files)
        .map((file) => `./tests/${file}`)
        .sort(),
    )
    for (const { active } of schedule.starts) {
      if (active.length > 1)
        expect(
          active.every((file) =>
            /^\.\/tests\/unit\/[abc]\.test\.ts$/.test(file),
          ),
        ).toBe(true)
    }
  },
)
