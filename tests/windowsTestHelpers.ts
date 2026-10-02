import { watch } from "node:fs"
import { readFile } from "node:fs/promises"
import { dirname, join } from "node:path"

export const windowsPowerShell = join(
  process.env.SystemRoot ?? "C:\\Windows",
  "System32",
  "WindowsPowerShell",
  "v1.0",
  "powershell.exe",
)

export async function compileWindowsFixture(name: string, output: string) {
  const child = Bun.spawn(
    [
      process.execPath,
      "build",
      "--compile",
      join(import.meta.dir, "fixtures", `${name}.ts`),
      "--outfile",
      output,
    ],
    { stdout: "pipe", stderr: "pipe" },
  )
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  if (exitCode !== 0)
    throw new Error(`Fixture compile failed: ${stdout}\n${stderr}`)
}

export function waitForFile(
  path: string,
  predicate: (value: string) => boolean = () => true,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const watcher = watch(dirname(path), () => {
      void check()
    })
    const timeout = setTimeout(() => {
      watcher.close()
      reject(new Error(`Timed out waiting for ${path}`))
    }, 20_000)
    const finish = (error?: Error, value?: string) => {
      clearTimeout(timeout)
      watcher.close()
      if (error) reject(error)
      else resolve(value!)
    }
    async function check() {
      try {
        const value = await readFile(path, "utf8")
        if (predicate(value)) finish(undefined, value)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT")
          finish(error as Error)
      }
    }
    watcher.on("error", (error) => finish(error))
    void check()
  })
}
