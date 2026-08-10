import { createCliRenderer } from "@opentui/core"
import { createRoot, extend } from "@opentui/react"
import { addDefaultParsers } from "@opentui/core"
import { KeymapProvider } from "@opentui/keymap/react"
import { RendererProvider } from "../ui/RendererContext"
import { App } from "../ui/App"
import { env } from "../env"
import { loadSettings } from "../filestore"
import { loadLastRequest } from "../ui/tabs/uiState"
import { createNoodleKeymap } from "../hooks/useKeymap"
import { parseOverrides } from "../ui/keybind"
import { showToast } from "../ui/Toast"
import { join, resolve } from "node:path"
import * as yaml from "js-yaml"
import { readFileSync } from "node:fs"
import { loadConfig } from "../hooks/useConfig"
import { takeSystemProxyFromEnv, type SystemProxySettings } from "../proxy"
import type { CollectionSettings } from "../schema"
import {
  CodeEditorRenderable,
  CodeEditorScrollBarRenderable,
} from "../ui/editor/CodeEditor"
import { codeEditorParsers } from "../ui/editor/codeEditorParsers"
import {
  classifyPath,
  isDirectoryPath,
  type CollectionMode,
} from "../collectionPath"

addDefaultParsers([...codeEditorParsers])

extend({
  "code-editor": CodeEditorRenderable,
  "code-editor-scrollbar": CodeEditorScrollBarRenderable,
})

const CONFIG_DIR = `${process.env.HOME ?? "~"}/.config/noodle`

export interface BootstrapOptions {
  targetPath?: string
  collectionDir?: string
  envName?: string
  noProxy?: boolean
  insecure?: boolean
  systemProxy?: SystemProxySettings
}

export { classifyPath, type CollectionMode } from "../collectionPath"

export function resolveStartupCollectionDir(
  options: BootstrapOptions,
  collectionPaths: string[],
  cwd = process.cwd(),
): string {
  if (options.targetPath) return resolve(options.targetPath)
  if (options.collectionDir) return resolve(options.collectionDir)

  const fromConfig = collectionPaths.find(isDirectoryPath)
  return fromConfig ? resolve(fromConfig) : resolve(cwd)
}

export async function bootstrap(options: BootstrapOptions): Promise<void> {
  const capturedSystemProxy = takeSystemProxyFromEnv()
  let collectionPaths: string[] = []
  try {
    collectionPaths = loadConfig(CONFIG_DIR).collections
  } catch {
    // config unavailable
  }
  const collectionDir = resolveStartupCollectionDir(options, collectionPaths)

  const mode: CollectionMode = classifyPath(collectionDir)
  if (mode === "invalid") {
    process.stderr.write(
      `error: collection path is not a directory: ${collectionDir}\n`,
    )
    process.exit(1)
    return
  }
  const shouldRegister =
    mode === "collection" && (!!options.targetPath || !!options.collectionDir)

  const environmentsDir = join(collectionDir, ".environments")

  let envList: string[]
  try {
    envList = await env.listEnvironments(environmentsDir)
  } catch {
    envList = []
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

  let initialSettings: CollectionSettings = {}
  if (mode === "collection") {
    try {
      initialSettings = await loadSettings(collectionDir)
    } catch {
      // settings.yml missing or invalid — ignore, use defaults
    }
  }

  let lastRequestId: string | undefined
  if (mode === "collection") {
    try {
      lastRequestId = await loadLastRequest(collectionDir)
    } catch {
      // ignore
    }
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
      renderer.clearSelection()
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
          collectionDir={collectionDir}
          envList={envList}
          initialEnvName={initialEnvName}
          initialSettings={initialSettings}
          noProxy={options.noProxy}
          insecure={options.insecure}
          systemProxy={options.systemProxy ?? capturedSystemProxy}
          keybinds={keybinds}
          lastRequestId={lastRequestId}
          shouldRegister={shouldRegister}
          mode={mode}
        />
      </RendererProvider>
    </KeymapProvider>,
  )
}
