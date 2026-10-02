import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  SECRET_SERVICE,
  deleteOAuth2Credential,
  deleteStoredSecret,
  ensureCollectionId,
  getOAuth2Credential,
  getStoredSecret,
  oauth2CredentialAccount,
  secretAccount,
  setOAuth2Credential,
  setSecretBackendForTests,
  setStoredSecret,
} from "../../src/secrets"

// Native credentials require an explicit opt-in and never use fixed app accounts.
describe.skipIf(
  process.platform !== "win32" ||
    process.env.NOODLE_TEST_WINDOWS_NATIVE !== "1",
)("Windows Credential Manager", () => {
  let dir: string
  let collectionId: string
  const accounts = new Set<string>()
  const environment = "windows-native-test"

  function own(key: string) {
    accounts.add(secretAccount(collectionId, environment, key))
    return key
  }

  beforeEach(async () => {
    setSecretBackendForTests(undefined)
    dir = await mkdtemp(join(tmpdir(), "noodle-wincred-"))
    collectionId = await ensureCollectionId(dir)
  })

  afterEach(async () => {
    const cleanup = await Promise.allSettled(
      [...accounts].map(async (name) => {
        await Bun.secrets.delete({ service: SECRET_SERVICE, name })
        expect(
          await Bun.secrets.get({ service: SECRET_SERVICE, name }),
        ).toBeNull()
      }),
    )
    accounts.clear()
    await rm(dir, { recursive: true, force: true })
    const failures = cleanup.filter((result) => result.status === "rejected")
    if (failures.length)
      throw new AggregateError(
        failures.map((result) => result.reason),
        "Unable to clean up owned Windows test credentials",
      )
  })

  it("round-trips Unicode secrets, overwrites, missing reads and idempotent deletes", async () => {
    const key = own("TOKEN")
    expect(await getStoredSecret(dir, environment, key)).toBeNull()
    await expect(setStoredSecret(dir, environment, key, "")).rejects.toThrow(
      "secret value must not be empty",
    )
    await setStoredSecret(dir, environment, key, "🔐 中文 café\nsecond line")
    expect(await getStoredSecret(dir, environment, key)).toBe(
      "🔐 中文 café\nsecond line",
    )
    await setStoredSecret(dir, environment, key, "updated")
    expect(await getStoredSecret(dir, environment, key)).toBe("updated")
    expect(await deleteStoredSecret(dir, environment, key)).toBe(true)
    expect(await getStoredSecret(dir, environment, key)).toBeNull()
    expect(await deleteStoredSecret(dir, environment, key)).toBe(false)
  })

  it("accepts exactly 2560 UTF-8 bytes and rejects overflow without replacing the credential", async () => {
    const key = own("BOUNDARY")
    for (const value of ["x".repeat(2560), "🔐".repeat(640)]) {
      expect(Buffer.byteLength(value, "utf8")).toBe(2560)
      await setStoredSecret(dir, environment, key, value)
      expect(await getStoredSecret(dir, environment, key)).toBe(value)
      await expect(
        setStoredSecret(dir, environment, key, `${value}x`),
      ).rejects.toThrow("secret write failed")
      expect(await getStoredSecret(dir, environment, key)).toBe(value)
    }
  })

  it("keeps concurrent credential operations and collection OAuth accounts independent", async () => {
    const operations = await Promise.allSettled(
      Array.from({ length: 8 }, async (_, index) => {
        const key = own(`PARALLEL_${index}`)
        const value = `owned-value-${index}-🔐`
        await setStoredSecret(dir, environment, key, value)
        expect(await getStoredSecret(dir, environment, key)).toBe(value)
        expect(await deleteStoredSecret(dir, environment, key)).toBe(true)
        expect(await getStoredSecret(dir, environment, key)).toBeNull()
      }),
    )
    for (const operation of operations) {
      if (operation.status === "rejected") throw operation.reason
    }
    const oauthKey = "owned-oauth-token"
    accounts.add(oauth2CredentialAccount(collectionId, oauthKey))
    await setOAuth2Credential(dir, oauthKey, "owned-refresh-token")
    expect(await getOAuth2Credential(dir, oauthKey)).toBe("owned-refresh-token")
    expect(await deleteOAuth2Credential(dir, oauthKey)).toBe(true)
    expect(await getOAuth2Credential(dir, oauthKey)).toBeNull()
  })
})
