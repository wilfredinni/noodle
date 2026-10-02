import { readFile, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import {
  CollectionCookieJar,
  setCookieJarStorageForTests,
} from "../../src/cookies"
import { setSecretBackendForTests } from "../../src/secrets"

const [configDir, vaultFile, keyLockFile, startFile, id] = Bun.argv.slice(2)
if (!configDir || !vaultFile || !keyLockFile || !startFile || !id) {
  throw new Error("Missing cookie process fixture arguments")
}

setCookieJarStorageForTests({ platform: "win32", keyLockFile })
setSecretBackendForTests({
  async get() {
    let stored: string | null
    try {
      stored = await readFile(vaultFile, "utf8")
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
      stored = null
    }
    // Keep overlapping missing-key reads deterministic when the lock is absent.
    await Bun.sleep(50)
    return stored
  },
  async set({ value }) {
    await writeFile(vaultFile, value)
    await writeFile(join(dirname(vaultFile), `stored-${id}`), "stored")
  },
  async delete() {
    return false
  },
})

await writeFile(join(dirname(vaultFile), `ready-${id}`), "ready")
const deadline = Date.now() + 5000
while (!(await Bun.file(startFile).exists())) {
  if (Date.now() >= deadline)
    throw new Error("Cookie process fixture did not start")
  await Bun.sleep(10)
}
const jar = await CollectionCookieJar.open(configDir, "new")
if (jar.status.state !== "encrypted")
  throw new Error("Cookie storage unavailable")
jar.put({ name: "session", value: id, domain: "example.com" })
await jar.close()
