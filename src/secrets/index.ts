import { createHash, randomUUID } from "node:crypto"
import { link, mkdir, readFile, unlink, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { loadSettings } from "../filestore/load"
import { saveSettings } from "../filestore/save"
import type {
  AppProxySettings,
  CollectionProxySettings,
  CollectionTlsSettings,
  ProxyCredentials,
  SecretStatus,
} from "../schema"

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
    throw new Error("secure credential storage is unavailable on this system")
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

export type AppSettingSecret =
  "proxy:username" | "proxy:password" | "cookie-jar-key"
export type CollectionSettingSecret =
  "proxy:username" | "proxy:password" | `tls:${string}:passphrase`

export function appSettingSecretAccount(secret: AppSettingSecret): string {
  return `app:settings:${secret}`
}

export function collectionSettingSecretAccount(
  collectionId: string,
  secret: CollectionSettingSecret,
): string {
  return `${collectionId}:settings:${secret}`
}

export function oauth2CredentialAccount(
  collectionId: string,
  credentialKey: string,
): string {
  const digest = createHash("sha256").update(credentialKey).digest("hex")
  return `${collectionId}:oauth2:${digest}`
}

async function getSecret(name: string): Promise<string | null> {
  try {
    return await backend().get({ service: SECRET_SERVICE, name })
  } catch (error) {
    throw storageError("read", error)
  }
}

async function setSecret(name: string, value: string): Promise<void> {
  if (value.length === 0) throw new Error("secret value must not be empty")
  try {
    await backend().set({
      service: SECRET_SERVICE,
      name,
      value,
      allowUnrestrictedAccess: false,
    })
  } catch (error) {
    throw storageError("write", error)
  }
}

async function deleteSecret(name: string): Promise<boolean> {
  try {
    return await backend().delete({ service: SECRET_SERVICE, name })
  } catch (error) {
    throw storageError("delete", error)
  }
}

export function getAppSettingSecret(
  secret: AppSettingSecret,
): Promise<string | null> {
  return getSecret(appSettingSecretAccount(secret))
}

export function setAppSettingSecret(
  secret: AppSettingSecret,
  value: string,
): Promise<void> {
  return setSecret(appSettingSecretAccount(secret), value)
}

export function deleteAppSettingSecret(
  secret: AppSettingSecret,
): Promise<boolean> {
  return deleteSecret(appSettingSecretAccount(secret))
}

export async function getCollectionSettingSecret(
  collectionDir: string,
  secret: CollectionSettingSecret,
): Promise<string | null> {
  return getSecret(
    collectionSettingSecretAccount(
      await ensureCollectionId(collectionDir),
      secret,
    ),
  )
}

export async function setCollectionSettingSecret(
  collectionDir: string,
  secret: CollectionSettingSecret,
  value: string,
): Promise<void> {
  return setSecret(
    collectionSettingSecretAccount(
      await ensureCollectionId(collectionDir),
      secret,
    ),
    value,
  )
}

export async function deleteCollectionSettingSecret(
  collectionDir: string,
  secret: CollectionSettingSecret,
): Promise<boolean> {
  return deleteSecret(
    collectionSettingSecretAccount(
      await ensureCollectionId(collectionDir),
      secret,
    ),
  )
}

export async function getOAuth2Credential(
  collectionDir: string,
  credentialKey: string,
): Promise<string | null> {
  return getSecret(
    oauth2CredentialAccount(
      await ensureCollectionId(collectionDir),
      credentialKey,
    ),
  )
}

export async function setOAuth2Credential(
  collectionDir: string,
  credentialKey: string,
  value: string,
): Promise<void> {
  return setSecret(
    oauth2CredentialAccount(
      await ensureCollectionId(collectionDir),
      credentialKey,
    ),
    value,
  )
}

export async function deleteOAuth2Credential(
  collectionDir: string,
  credentialKey: string,
): Promise<boolean> {
  return deleteSecret(
    oauth2CredentialAccount(
      await ensureCollectionId(collectionDir),
      credentialKey,
    ),
  )
}

export async function loadAppProxyCredentials(
  proxy: AppProxySettings | undefined,
): Promise<ProxyCredentials> {
  if (proxy?.mode !== "custom" || proxy.auth !== true) return {}
  const [username, password] = await Promise.all([
    getAppSettingSecret("proxy:username"),
    getAppSettingSecret("proxy:password"),
  ])
  return {
    username: username ?? undefined,
    password: password ?? undefined,
  }
}

export async function loadCollectionProxyCredentials(
  collectionDir: string,
  proxy: CollectionProxySettings | undefined,
): Promise<ProxyCredentials> {
  if (proxy?.mode !== "custom" || proxy.auth !== true) return {}
  const collectionId = await ensureCollectionId(collectionDir)
  const [username, password] = await Promise.all([
    getSecret(collectionSettingSecretAccount(collectionId, "proxy:username")),
    getSecret(collectionSettingSecretAccount(collectionId, "proxy:password")),
  ])
  return {
    username: username ?? undefined,
    password: password ?? undefined,
  }
}

export async function loadTlsPassphrases(
  collectionDir: string,
  tls: CollectionTlsSettings | undefined,
): Promise<Record<string, string>> {
  const ids = [
    ...new Set(
      (tls?.clientCertificates ?? [])
        .map((profile) => profile.secretId)
        .filter((id): id is string => id !== undefined),
    ),
  ]
  if (ids.length === 0) return {}
  const collectionId = await ensureCollectionId(collectionDir)
  const entries = await Promise.all(
    ids.map(
      async (id) =>
        [
          id,
          await getSecret(
            collectionSettingSecretAccount(
              collectionId,
              `tls:${id}:passphrase`,
            ),
          ),
        ] as const,
    ),
  )
  return Object.fromEntries(
    entries.filter(
      (entry): entry is readonly [string, string] => entry[1] !== null,
    ),
  )
}

export interface SecretMutation {
  get: () => Promise<string | null>
  set: (value: string) => Promise<void>
  delete: () => Promise<boolean>
  value?: string
}

export async function applySettingsSecretTransaction(
  mutations: SecretMutation[],
  persist: () => Promise<void> | void,
): Promise<void> {
  const snapshots = await Promise.all(
    mutations.map((mutation) => mutation.get()),
  )
  try {
    for (const mutation of mutations) {
      if (mutation.value) await mutation.set(mutation.value)
      else await mutation.delete()
    }
    await persist()
  } catch (error) {
    try {
      for (const [index, mutation] of mutations.entries()) {
        const snapshot = snapshots[index]
        if (snapshot === null) await mutation.delete()
        else await mutation.set(snapshot)
      }
    } catch (rollbackError) {
      throw new AggregateError(
        [error, rollbackError],
        `settings secret update failed (${
          error instanceof Error ? error.message : String(error)
        }) and rollback also failed: ${
          rollbackError instanceof Error
            ? rollbackError.message
            : String(rollbackError)
        }`,
        { cause: rollbackError },
      )
    }
    throw error
  }
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
