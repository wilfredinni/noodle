import { spyOn } from "bun:test"
import * as fs from "node:fs/promises"
import { join } from "node:path"
import { setSecretBackendForTests, setStoredSecret } from "../../src/secrets"

const [collectionDir, shared, startFile, id] = Bun.argv.slice(2)
if (!collectionDir || !shared || !startFile || !id) {
  throw new Error("Missing collection id process fixture arguments")
}

setSecretBackendForTests({
  async get() {
    return null
  },
  async set({ name, allowUnrestrictedAccess }) {
    if (allowUnrestrictedAccess !== false)
      throw new Error("Credential access is unrestricted")
    await fs.writeFile(join(shared, `account-${id}`), name)
  },
  async delete() {
    return false
  },
})

const realRename = fs.rename
const publication = spyOn(fs, "rename").mockImplementation(async (from, to) => {
  if (String(to).endsWith("settings.yml")) {
    await fs.writeFile(join(shared, `published-${id}`), "published")
    // Expose overlapping publication attempts without platform-dependent errors.
    await Bun.sleep(50)
  }
  return realRename(from, to)
})

try {
  await fs.writeFile(join(shared, `ready-${id}`), "ready")
  const deadline = Date.now() + 5000
  while (!(await Bun.file(startFile).exists())) {
    if (Date.now() >= deadline)
      throw new Error("Collection id fixture did not start")
    await Bun.sleep(10)
  }
  await setStoredSecret(collectionDir, "dev", `TOKEN_${id}`, `value-${id}`)
} finally {
  publication.mockRestore()
}
