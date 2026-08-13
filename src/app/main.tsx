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
import type { CollectionSettings, ProxyCredentials } from "../schema"
import {
  loadAppProxyCredentials,
  loadCollectionProxyCredentials,
  loadTlsPassphrases,
} from "../secrets"
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
import { flushAll } from "../cookies"

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

export async function flushCookieJarsForShutdown(
  flush: () => Promise<void> = flushAll,
  report: (message: string) => void = (message) =>
    process.stderr.write(`${message}\n`),
): Promise<boolean> {
  try {
    await flush()
    return true
  } catch (error) {
    report(
      `warning: failed to flush cookie storage before shutdown: ${error instanceof Error ? error.message : String(error)}`,
    )
    return false
  }
}

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
  let collectionPaths: string[]
  let appProxy
  try {
    const config = loadConfig(CONFIG_DIR)
    collectionPaths = config.collections
    appProxy = config.proxy
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`error: ${message}\n`)
    process.exit(1)
    return
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
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      process.stderr.write(`error: ${message}\n`)
      process.exit(1)
    }
  }

  let initialAppProxyCredentials: ProxyCredentials = {}
  let initialCollectionProxyCredentials: ProxyCredentials = {}
  let initialTlsPassphrases: Record<string, string> = {}
  let initialSettingsSecretError: string | undefined
  try {
    ;[
      initialAppProxyCredentials,
      initialCollectionProxyCredentials,
      initialTlsPassphrases,
    ] = await Promise.all([
      loadAppProxyCredentials(appProxy),
      mode === "collection"
        ? loadCollectionProxyCredentials(collectionDir, initialSettings.proxy)
        : Promise.resolve({}),
      mode === "collection"
        ? loadTlsPassphrases(collectionDir, initialSettings.tls)
        : Promise.resolve({}),
    ])
  } catch (error) {
    initialSettingsSecretError =
      error instanceof Error ? error.message : String(error)
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
  let shuttingDown = false
  const shutdown = () => {
    if (shuttingDown) return
    shuttingDown = true
    void flushCookieJarsForShutdown().finally(() => renderer.destroy())
  }
  process.once("SIGTERM", shutdown)
  process.once("SIGHUP", shutdown)

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
      shutdown()
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
          initialAppProxyCredentials={initialAppProxyCredentials}
          initialCollectionProxyCredentials={initialCollectionProxyCredentials}
          initialTlsPassphrases={initialTlsPassphrases}
          initialSettingsSecretError={initialSettingsSecretError}
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
