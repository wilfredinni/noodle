import { createCliRenderer } from "@opentui/core"
import { createRoot } from "@opentui/react"
import { KeymapProvider } from "@opentui/keymap/react"
import { RendererProvider } from "../ui/RendererContext"
import { App } from "../ui/App"
import { parseArgs, type ParsedArgs } from "./args"
import { env } from "../env"
import { loadSettings } from "../filestore"
import { loadLastRequest } from "../ui/tabs/uiState"
import { createNoodleKeymap } from "../hooks/useKeymap"
import { parseOverrides } from "../ui/keybind"
import { join } from "node:path"
import * as yaml from "js-yaml"
import { readFileSync } from "node:fs"

const USAGE = `Usage: bun run dev [--collection <dir>] [--env <name>] [--help]

Options:
  --collection <dir>   collection directory to load (default: ./collections)
  --env <name>         environment name (loads <collection>/environments/<name>.env)
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

const environmentsDir = join(args.collectionDir, "environments")

let envList: string[]
try {
  envList = await env.listEnvironments(environmentsDir)
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

let settingsEnv: string | undefined
try {
  const settings = await loadSettings(args.collectionDir)
  settingsEnv = settings.environment
} catch {
  // settings.yml missing or invalid — ignore, use defaults
}

let lastRequestId: string | undefined
try {
  lastRequestId = await loadLastRequest(args.collectionDir)
} catch {
  // ignore — fall through to undefined
}

const KEYBINDS_PATH = `${process.env.HOME ?? "~"}/.config/noodle/keybinds.yml`
let keybindsConfig: Record<string, unknown> = {}
try {
  const raw = readFileSync(KEYBINDS_PATH, "utf-8")
  keybindsConfig = yaml.load(raw) as Record<string, unknown>
} catch {
  // file doesn't exist or invalid — use defaults silently
}

const keybinds = parseOverrides(keybindsConfig)

const renderer = await createCliRenderer({ exitOnCtrlC: true })
const keymap = createNoodleKeymap(renderer)

createRoot(renderer).render(
  <KeymapProvider keymap={keymap}>
    <RendererProvider renderer={renderer}>
      <App
        collectionDir={args.collectionDir}
        environmentsDir={environmentsDir}
        envList={envList}
        initialEnvName={initialEnvName}
        settingsEnv={settingsEnv}
        keybinds={keybinds}
        lastRequestId={lastRequestId}
      />
    </RendererProvider>
  </KeymapProvider>,
)
