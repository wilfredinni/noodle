import { join } from "node:path"
import { startDevServer, collectionDir, defaultPorts } from "./server"
import { developmentSecrets } from "./auth"

export async function runDevelopment(
  supplied: string[],
  ports: Parameters<typeof startDevServer>[0] = defaultPorts,
) {
  supplied = supplied.filter((arg) => arg !== "--")
  let hasCollection = false
  let hasEnvironment = false
  for (let i = 0; i < supplied.length; i++) {
    const arg = supplied[i]!
    if (/^(--collection|-c)(=|$)/.test(arg)) hasCollection = true
    if (/^(--env|-e)(=|$)/.test(arg)) hasEnvironment = true
    if (["--collection", "-c", "--env", "-e"].includes(arg)) i++
    else if (!arg.startsWith("-")) hasCollection = true
  }
  const args = [
    ...(!hasCollection ? ["--collection", collectionDir] : []),
    ...(!hasEnvironment && !hasCollection ? ["--env", "development"] : []),
    ...supplied,
  ]
  const services = await startDevServer(ports)
  let child: ReturnType<typeof Bun.spawn> | undefined
  let stopping: Promise<void> | undefined
  const stop = () =>
    (stopping ??= (async () => {
      child?.kill()
      await services.close()
      if (child) await child.exited
    })())
  const onSignal = () => {
    void stop()
  }
  try {
    child = Bun.spawn(
      [
        process.execPath,
        "--no-orphans",
        "--watch",
        join(import.meta.dir, "../src/app/cli.ts"),
        ...args,
      ],
      {
        cwd: join(import.meta.dir, ".."),
        env: { ...process.env, ...(!hasCollection ? developmentSecrets : {}) },
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit",
      },
    )
    process.once("SIGINT", onSignal)
    process.once("SIGTERM", onSignal)
    return await child.exited
  } finally {
    process.off("SIGINT", onSignal)
    process.off("SIGTERM", onSignal)
    await stop()
  }
}

if (import.meta.main)
  process.exitCode = await runDevelopment(process.argv.slice(2))
