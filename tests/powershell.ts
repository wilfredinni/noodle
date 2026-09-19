export const powershellTestTimeout = 30_000

export const powershellArgs = [
  "powershell.exe",
  "-NoProfile",
  "-NonInteractive",
  "-ExecutionPolicy",
  "Bypass",
]

export async function runPowerShell(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
) {
  const child = Bun.spawn([...powershellArgs, ...args], {
    env,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    timeout: 20_000,
  })
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ])
  if (child.signalCode || exitCode === null)
    throw new Error(
      `PowerShell terminated (${child.signalCode}): ${stderr || stdout}`,
    )
  return { exitCode, stdout, stderr }
}
