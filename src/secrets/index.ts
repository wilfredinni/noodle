import { createHash, randomUUID } from "node:crypto"
import { link, mkdir, readFile, unlink, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { loadSettings } from "../filestore/load"
import { saveSettings } from "../filestore/save"
import type { SecretStatus } from "../schema"

export const SECRET_SERVICE = "dev.noodlerest.noodle"

export interface SecretBackend {
  get(options: { service: string; name: string }): Promise<string | null>
  set(options: {
    service: string
    name: string
    value: string
    allowUnrestrictedAccess?: boolean
  }): Promise<void>
  delete(options: { service: string; name: string }): Promise<boolean>
}

let testBackend: SecretBackend | undefined

export function setSecretBackendForTests(
  backend: SecretBackend | undefined,
): void {
  testBackend = backend
}

function backend(): SecretBackend {
  const candidate = testBackend ?? Bun.secrets
  if (!candidate) {
    throw new Error(
      "secure credential storage is unavailable in this Bun runtime",
    )
  }
  return candidate
}

function storageError(action: string, error: unknown): Error {
  const platformHint =
    process.platform === "linux"
      ? " Ensure a Secret Service provider such as GNOME Keyring or KWallet is running."
      : " Ensure the operating system credential manager is available."
  const message = error instanceof Error ? error.message : String(error)
  return new Error(`secret ${action} failed: ${message}.${platformHint}`, {
    cause: error,
  })
}

export function secretAccount(
  collectionId: string,
  environment: string,
  key: string,
): string {
  const digest = createHash("sha256")
    .update(environment)
    .update("\0")
    .update(key)
    .digest("hex")
  return `${collectionId}:${digest}`
}

async function reserveCollectionId(collectionDir: string): Promise<string> {
  const stateDir = join(collectionDir, ".noodle")
  const reservationPath = join(stateDir, "collection-id")
  const candidate = randomUUID()
  const candidatePath = `${reservationPath}.${candidate}.tmp`
  await mkdir(stateDir, { recursive: true })
  await writeFile(candidatePath, candidate, "utf8")
  try {
    await link(candidatePath, reservationPath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
  } finally {
    await unlink(candidatePath).catch(() => {})
  }
  return (await readFile(reservationPath, "utf8")).trim()
}

export async function ensureCollectionId(
  collectionDir: string,
): Promise<string> {
  const settings = await loadSettings(collectionDir)
  if (settings.collectionId) return settings.collectionId
  const reservedId = await reserveCollectionId(collectionDir)
  const current = await loadSettings(collectionDir)
  if (current.collectionId) return current.collectionId
  await saveSettings(collectionDir, { ...current, collectionId: reservedId })
  return reservedId
}

export async function getStoredSecret(
  collectionDir: string,
  environment: string,
  key: string,
): Promise<string | null> {
  const collectionId = await ensureCollectionId(collectionDir)
  try {
    return await backend().get({
      service: SECRET_SERVICE,
      name: secretAccount(collectionId, environment, key),
    })
  } catch (error) {
    throw storageError("read", error)
  }
}

export async function setStoredSecret(
  collectionDir: string,
  environment: string,
  key: string,
  value: string,
): Promise<void> {
  if (value.length === 0) throw new Error("secret value must not be empty")
  const collectionId = await ensureCollectionId(collectionDir)
  try {
    await backend().set({
      service: SECRET_SERVICE,
      name: secretAccount(collectionId, environment, key),
      value,
      allowUnrestrictedAccess: false,
    })
  } catch (error) {
    throw storageError("write", error)
  }
}

export async function deleteStoredSecret(
  collectionDir: string,
  environment: string,
  key: string,
): Promise<boolean> {
  const collectionId = await ensureCollectionId(collectionDir)
  try {
    return await backend().delete({
      service: SECRET_SERVICE,
      name: secretAccount(collectionId, environment, key),
    })
  } catch (error) {
    throw storageError("delete", error)
  }
}

export async function resolveStoredSecret(
  collectionDir: string,
  environment: string,
  key: string,
): Promise<{ value?: string; status: SecretStatus }> {
  const processValue = process.env[key]
  if (processValue !== undefined) {
    return { value: processValue, status: "process" }
  }
  const stored = await getStoredSecret(collectionDir, environment, key)
  return stored ? { value: stored, status: "keychain" } : { status: "missing" }
}
