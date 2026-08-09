import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import * as yaml from "js-yaml"
import { keybindOverrides, type Keybinds } from "./keybind"

export const KEYBINDS_FILE_NAME = "keybinds.yml"

export function saveKeybinds(configDir: string, keybinds: Keybinds): void {
  try {
    mkdirSync(configDir, { recursive: true })
    writeFileSync(
      join(configDir, KEYBINDS_FILE_NAME),
      yaml.dump(keybindOverrides(keybinds)),
      "utf8",
    )
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    throw new Error(`keybindConfig.saveKeybinds: ${message}`, { cause: e })
  }
}
