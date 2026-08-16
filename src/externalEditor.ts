import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

const EDITORS = [
  { id: "zed", label: "Zed", command: "zed", macApp: "Zed.app" },
  {
    id: "vscode",
    label: "Visual Studio Code",
    command: "code",
    macApp: "Visual Studio Code.app",
  },
  {
    id: "sublime",
    label: "Sublime Text",
    command: "subl",
    macApp: "Sublime Text.app",
  },
  { id: "cursor", label: "Cursor", command: "cursor", macApp: "Cursor.app" },
  {
    id: "windsurf",
    label: "Windsurf",
    command: "windsurf",
    macApp: "Windsurf.app",
  },
  {
    id: "vscodium",
    label: "VSCodium",
    command: "codium",
    macApp: "VSCodium.app",
  },
] as const

export type ExternalEditorId = (typeof EDITORS)[number]["id"]

export interface ExternalEditor {
  id: ExternalEditorId
  label: string
  command: string[]
}

export function isExternalEditorId(value: unknown): value is ExternalEditorId {
  return EDITORS.some((editor) => editor.id === value)
}

export function detectExternalEditors({
  platform = process.platform,
  homeDir = homedir(),
  which = Bun.which,
  exists = existsSync,
}: {
  platform?: NodeJS.Platform
  homeDir?: string
  which?: (command: string) => string | null
  exists?: (path: string) => boolean
} = {}): ExternalEditor[] {
  return EDITORS.flatMap((editor) => {
    const executable = which(editor.command)
    if (executable) {
      return [{ id: editor.id, label: editor.label, command: [executable] }]
    }
    if (platform !== "darwin") return []

    const appPath = [
      join("/Applications", editor.macApp),
      join(homeDir, "Applications", editor.macApp),
    ].find(exists)
    return appPath
      ? [
          {
            id: editor.id,
            label: editor.label,
            command: ["open", "-a", appPath],
          },
        ]
      : []
  })
}

export function resolveExternalEditor(
  preferred: ExternalEditorId | undefined,
  installed: ExternalEditor[],
): ExternalEditor | undefined {
  return installed.find((editor) => editor.id === preferred) ?? installed[0]
}

export function launchExternalEditor(
  editor: ExternalEditor,
  target: string,
  spawn: (
    command: string[],
    options: { stdin: "ignore"; stdout: "ignore"; stderr: "ignore" },
  ) => { exited: Promise<number> } = (command, options) =>
    Bun.spawn(command, options),
): Promise<void> {
  let processHandle: { exited: Promise<number> }
  try {
    processHandle = spawn([...editor.command, target], {
      stdin: "ignore",
      stdout: "ignore",
      stderr: "ignore",
    })
  } catch (error) {
    throw new Error(`Unable to open folder in ${editor.label}`, {
      cause: error,
    })
  }
  return processHandle.exited.then((exitCode) => {
    if (exitCode !== 0) {
      throw new Error(`Unable to open folder in ${editor.label}`)
    }
  })
}
