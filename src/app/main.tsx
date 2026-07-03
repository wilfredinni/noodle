import { createCliRenderer } from "@opentui/core"
import { createRoot } from "@opentui/react"
import { KeymapProvider } from "@opentui/keymap/react"
import { RendererProvider } from "../ui/RendererContext"
import { App } from "../ui/App"
import { env } from "../env"
import { loadSettings } from "../filestore"
import { loadLastRequest } from "../ui/tabs/uiState"
import { createNoodleKeymap } from "../hooks/useKeymap"
import { parseOverrides } from "../ui/keybind"
import { showToast } from "../ui/Toast"
import { join } from "node:path"
import * as yaml from "js-yaml"
import { readFileSync } from "node:fs"

export interface BootstrapOptions {
  collectionDir: string
  envName?: string
}

export async function bootstrap(options: BootstrapOptions): Promise<void> {
  const environmentsDir = join(options.collectionDir, ".environments")

  let envList: string[]
  try {
    envList = await env.listEnvironments(environmentsDir)
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e)
    process.stderr.write(`error: ${reason}\n`)
    process.exit(1)
  }

  let initialEnvName: string | undefined
  if (options.envName !== undefined) {
    if (!envList.includes(options.envName)) {
      const available = envList.length > 0 ? envList.join(", ") : "(none)"
      process.stderr.write(
        `error: environment "${options.envName}" not found.\nAvailable envs: ${available}\n`,
      )
      process.exit(1)
    }
    initialEnvName = options.envName
  }

  let settingsEnv: string | undefined
  try {
    const settings = await loadSettings(options.collectionDir)
    settingsEnv = settings.environment
  } catch {
    // settings.yml missing or invalid — ignore, use defaults
  }

  let lastRequestId: string | undefined
  try {
    lastRequestId = await loadLastRequest(options.collectionDir)
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

  const renderer = await createCliRenderer({ exitOnCtrlC: false })
  const keymap = createNoodleKeymap(renderer)

  renderer.on("selection", (selection) => {
    const text = selection.getSelectedText()
    if (text) {
      renderer.copyToClipboardOSC52(text)
      showToast("Copied to clipboard", "info")
    }
  })

  renderer.keyInput.on("keypress", (key) => {
    if (key.ctrl && key.name === "c") {
      const editor = renderer.currentFocusedEditor
      const selectedText = editor?.hasSelection()
        ? editor.getSelectedText()
        : renderer.hasSelection
          ? renderer.getSelection()?.getSelectedText()
          : null
      if (selectedText) {
        renderer.copyToClipboardOSC52(selectedText)
        renderer.clearSelection()
        showToast("Copied to clipboard", "info")
        return
      }
      renderer.destroy()
    }
  })

  createRoot(renderer).render(
    <KeymapProvider keymap={keymap}>
      <RendererProvider renderer={renderer}>
        <App
          collectionDir={options.collectionDir}
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
}
