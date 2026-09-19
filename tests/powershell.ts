import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

export const powershellTestTimeout = 30_000

export const powershellArgs = [
  process.arch === "arm64" ? "pwsh.exe" : "powershell.exe",
  "-NoProfile",
  "-NonInteractive",
  "-ExecutionPolicy",
  "Bypass",
]

export async function runPowerShell(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
) {
  const outputDir = await mkdtemp(join(tmpdir(), "noodle-powershell-output-"))
  const stdoutPath = join(outputDir, "stdout.txt")
  const stderrPath = join(outputDir, "stderr.txt")
  try {
    const child = Bun.spawn([...powershellArgs, ...args], {
      env,
      stdin: "ignore",
      stdout: Bun.file(stdoutPath),
      stderr: Bun.file(stderrPath),
      timeout: 20_000,
    })
    const exitCode = await child.exited
    const [stdout, stderr] = await Promise.all([
      Bun.file(stdoutPath).text(),
      Bun.file(stderrPath).text(),
    ])
    if (child.signalCode || exitCode === null)
      throw new Error(
        `PowerShell terminated (${child.signalCode}): ${stderr || stdout}`,
      )
    return { exitCode, stdout, stderr }
  } finally {
    await rm(outputDir, { recursive: true, force: true }).catch(() => {})
  }
}
