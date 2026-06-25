import { createCliRenderer } from "@opentui/core"
import { createRoot } from "@opentui/react"
import { App } from "../ui/App"
import { parseArgs, type ParsedArgs } from "./args"
import { env } from "../env"

const ENVIRONMENTS_DIR = "./environments"

const USAGE = `Usage: bun run dev [--collection <dir>] [--env <name>] [--help]

Options:
  --collection <dir>   collection directory to load (default: ./collections)
  --env <name>         environment name (loads environments/<name>.yml)
  -h, --help           show this help and exit
`

let args: ParsedArgs
try {
  args = parseArgs(process.argv.slice(2))
} catch (e) {
  const reason = e instanceof Error ? e.message : String(e)
  process.stderr.write(`error: ${reason}\n\n${USAGE}`)
  process.exit(1)
}
if (args.help) {
  process.stdout.write(USAGE)
  process.exit(0)
}

let envList: string[]
try {
  envList = await env.listEnvironments(ENVIRONMENTS_DIR)
} catch (e) {
  const reason = e instanceof Error ? e.message : String(e)
  process.stderr.write(`error: ${reason}\n`)
  process.exit(1)
}

let initialEnvName: string | undefined
if (args.envName !== undefined) {
  if (!envList.includes(args.envName)) {
    const available = envList.length > 0 ? envList.join(", ") : "(none)"
    process.stderr.write(
      `error: environment "${args.envName}" not found.\nAvailable envs: ${available}\n`,
    )
    process.exit(1)
  }
  initialEnvName = args.envName
}

const renderer = await createCliRenderer({ exitOnCtrlC: true })
createRoot(renderer).render(
  <App
    collectionDir={args.collectionDir}
    environmentsDir={ENVIRONMENTS_DIR}
    envList={envList}
    initialEnvName={initialEnvName}
  />,
)
