import { existsSync } from "node:fs"
import { mkdir } from "node:fs/promises"
import { randomUUID } from "node:crypto"
import { join } from "node:path"
import { env } from "../env"
import { saveSettings } from "./save"

export async function ensureCollectionBootstrapped(dir: string): Promise<void> {
  const envDir = join(dir, ".environments")
  const settingsPath = join(dir, "settings.yml")

  if (!existsSync(settingsPath)) {
    await saveSettings(dir, {
      collectionId: randomUUID(),
      environment: "development",
    })
  }
  if (!existsSync(envDir)) {
    await mkdir(envDir, { recursive: true })
    await env.saveEnvironment(envDir, { name: "development", vars: {} })
  }
}
