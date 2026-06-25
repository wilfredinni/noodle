import { createCliRenderer } from "@opentui/core"
import { createRoot } from "@opentui/react"
import { App } from "../ui/App"
import { parseArgs, type ParsedArgs } from "./args"

const USAGE = `Usage: bun run dev [--collection <dir>] [--help]

Options:
  --collection <dir>   collection directory to load (default: ./collections)
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

const renderer = await createCliRenderer({ exitOnCtrlC: true })
createRoot(renderer).render(<App collectionDir={args.collectionDir} />)
