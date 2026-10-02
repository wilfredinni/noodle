import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test"
import * as fs from "node:fs/promises"
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises"
import { join, resolve } from "node:path"
import { tmpdir } from "node:os"
import { env } from "../src/env"
import {
  loadSettings,
  loadTimeline,
  saveSettings,
  saveTimelineEntry,
} from "../src/filestore"
import { saveRequest } from "../src/filestore"
import {
  environmentSet,
  secretDelete,
  secretList,
  secretSet,
} from "../src/app/services"
import {
  SECRET_SERVICE,
  appSettingSecretAccount,
  applySettingsSecretTransaction,
  collectionSettingSecretAccount,
  deleteAppSettingSecret,
  deleteCollectionSettingSecret,
  deleteStoredSecret,
  getAppSettingSecret,
  getCollectionSettingSecret,
  getStoredSecret,
  secretAccount,
  setSecretBackendForTests,
  setAppSettingSecret,
  setCollectionSettingSecret,
  setStoredSecret,
  type SecretBackend,
} from "../src/secrets"

function memoryBackend(): SecretBackend & { values: Map<string, string> } {
  const values = new Map<string, string>()
  return {
    values,
    async get({ service, name }) {
      return values.get(`${service}:${name}`) ?? null
    },
    async set({ service, name, value, allowUnrestrictedAccess }) {
      expect(allowUnrestrictedAccess).toBe(false)
      values.set(`${service}:${name}`, value)
    },
    async delete({ service, name }) {
      return values.delete(`${service}:${name}`)
    },
  }
}

let originalSecretTest: string | undefined

beforeEach(() => {
  originalSecretTest = process.env.NOODLE_SECRET_TEST
  delete process.env.NOODLE_SECRET_TEST
})

afterEach(() => {
  setSecretBackendForTests(undefined)
  if (originalSecretTest === undefined) delete process.env.NOODLE_SECRET_TEST
  else process.env.NOODLE_SECRET_TEST = originalSecretTest
})

describe("secret storage", () => {
  it("isolates app, collection, proxy, and TLS setting accounts", async () => {
    const root = await mkdtemp(join(tmpdir(), "noodle-settings-secret-"))
    const collectionId = "123e4567-e89b-42d3-a456-426614174000"
    const tlsId = "223e4567-e89b-42d3-a456-426614174000"
    await saveSettings(root, { collectionId })
    const backend = memoryBackend()
    setSecretBackendForTests(backend)

    await setAppSettingSecret("proxy:username", "app-user")
    await setCollectionSettingSecret(root, "proxy:username", "collection-user")
    await setCollectionSettingSecret(
      root,
      `tls:${tlsId}:passphrase`,
      "tls-secret",
    )

    expect(await getAppSettingSecret("proxy:username")).toBe("app-user")
    expect(await getCollectionSettingSecret(root, "proxy:username")).toBe(
      "collection-user",
    )
    expect(
      await getCollectionSettingSecret(root, `tls:${tlsId}:passphrase`),
    ).toBe("tls-secret")
    expect(appSettingSecretAccount("proxy:username")).toBe(
      "app:settings:proxy:username",
    )
    expect(collectionSettingSecretAccount(collectionId, "proxy:password")).toBe(
      `${collectionId}:settings:proxy:password`,
    )
  })

  it("sets, replaces, deletes, and reports missing setting secrets", async () => {
    const root = await mkdtemp(join(tmpdir(), "noodle-settings-secret-"))
    await saveSettings(root, {
      collectionId: "123e4567-e89b-42d3-a456-426614174000",
    })
    setSecretBackendForTests(memoryBackend())

    expect(await getAppSettingSecret("proxy:password")).toBeNull()
    await setAppSettingSecret("proxy:password", "first")
    await setAppSettingSecret("proxy:password", "second")
    expect(await getAppSettingSecret("proxy:password")).toBe("second")
    expect(await deleteAppSettingSecret("proxy:password")).toBe(true)
    expect(await deleteAppSettingSecret("proxy:password")).toBe(false)

    await setCollectionSettingSecret(root, "proxy:password", "value")
    expect(await deleteCollectionSettingSecret(root, "proxy:password")).toBe(
      true,
    )
  })

  it("restores setting secrets when persistence fails", async () => {
    const backend = memoryBackend()
    setSecretBackendForTests(backend)
    await setAppSettingSecret("proxy:username", "old-user")
    await setAppSettingSecret("proxy:password", "old-password")

    await expect(
      applySettingsSecretTransaction(
        [
          {
            get: () => getAppSettingSecret("proxy:username"),
            set: (value) => setAppSettingSecret("proxy:username", value),
            delete: () => deleteAppSettingSecret("proxy:username"),
            value: "new-user",
          },
          {
            get: () => getAppSettingSecret("proxy:password"),
            set: (value) => setAppSettingSecret("proxy:password", value),
            delete: () => deleteAppSettingSecret("proxy:password"),
          },
        ],
        () => {
          throw new Error("disk full")
        },
      ),
    ).rejects.toThrow("disk full")
    expect(await getAppSettingSecret("proxy:username")).toBe("old-user")
    expect(await getAppSettingSecret("proxy:password")).toBe("old-password")
  })

  it("preserves the update and rollback failures when both fail", async () => {
    const updateError = new Error("disk full")
    const rollbackError = new Error("credential store offline")
    let error: Error | undefined

    try {
      await applySettingsSecretTransaction(
        [
          {
            get: async () => "old-secret",
            set: async (value) => {
              if (value === "old-secret") throw rollbackError
            },
            delete: async () => false,
            value: "new-secret",
          },
        ],
        () => {
          throw updateError
        },
      )
    } catch (caught) {
      error = caught as Error
    }

    expect(error?.message).toContain("disk full")
    expect(error?.message).toContain("credential store offline")
    expect(error).toBeInstanceOf(AggregateError)
    expect((error as AggregateError).errors).toEqual([
      updateError,
      rollbackError,
    ])
    expect(error?.cause).toBe(rollbackError)
  })

  it("namespaces credentials and resolves process values before the keychain", async () => {
    const root = await mkdtemp(join(tmpdir(), "noodle-secret-"))
    const directory = join(root, ".environments")
    await mkdir(directory)
    await saveSettings(root, {
      collectionId: "123e4567-e89b-42d3-a456-426614174000",
    })
    await writeFile(
      join(directory, "dev.env"),
      "# @secret NOODLE_SECRET_TEST\nNOODLE_SECRET_TEST=\n",
    )
    const backend = memoryBackend()
    setSecretBackendForTests(backend)
    await setStoredSecret(root, "dev", "NOODLE_SECRET_TEST", "stored")

    let loaded = await env.loadEnvironment(directory, "dev")
    expect(loaded.vars.NOODLE_SECRET_TEST).toBe("stored")
    expect(loaded.secretVars?.NOODLE_SECRET_TEST).toBe("keychain")

    process.env.NOODLE_SECRET_TEST = "process"
    loaded = await env.loadEnvironment(directory, "dev")
    expect(loaded.vars.NOODLE_SECRET_TEST).toBe("process")
    expect(loaded.secretVars?.NOODLE_SECRET_TEST).toBe("process")

    process.env.NOODLE_SECRET_TEST = ""
    loaded = await env.loadEnvironment(directory, "dev")
    expect(loaded.vars.NOODLE_SECRET_TEST).toBe("")
    expect(loaded.secretVars?.NOODLE_SECRET_TEST).toBe("process")
    expect(
      backend.values.has(
        `${SECRET_SERVICE}:${secretAccount(
          "123e4567-e89b-42d3-a456-426614174000",
          "dev",
          "NOODLE_SECRET_TEST",
        )}`,
      ),
    ).toBe(true)
  })

  it("creates a stable collection id on the first secret operation", async () => {
    const root = await mkdtemp(join(tmpdir(), "noodle-secret-id-"))
    await saveSettings(root, { environment: "dev" })
    setSecretBackendForTests(memoryBackend())
    await setStoredSecret(root, "dev", "TOKEN", "value")
    const first = (await loadSettings(root)).collectionId
    await deleteStoredSecret(root, "dev", "TOKEN")
    expect((await loadSettings(root)).collectionId).toBe(first)
    expect(first).toMatch(/^[0-9a-f-]{36}$/)
  })

  it("reads an existing collection id without writing to its collection directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "noodle-secret-id-read-"))
    const collectionId = "123e4567-e89b-42d3-a456-426614174000"
    await saveSettings(root, { collectionId })
    const backend = memoryBackend()
    backend.values.set(
      `${SECRET_SERVICE}:${secretAccount(collectionId, "dev", "TOKEN")}`,
      "stored",
    )
    setSecretBackendForTests(backend)
    const makeDirectory = spyOn(fs, "mkdir").mockRejectedValue(
      new Error("collection is read-only"),
    )
    const write = spyOn(fs, "writeFile").mockRejectedValue(
      new Error("collection is read-only"),
    )
    try {
      expect(await getStoredSecret(root, "dev", "TOKEN")).toBe("stored")
      expect(makeDirectory).not.toHaveBeenCalled()
      expect(write).not.toHaveBeenCalled()
      expect(await readdir(root)).toEqual(["settings.yml"])
    } finally {
      makeDirectory.mockRestore()
      write.mockRestore()
      await rm(root, { recursive: true, force: true })
    }
  })

  it("uses one collection id when secret operations initialize concurrently", async () => {
    const root = await mkdtemp(join(tmpdir(), "noodle-secret-race-"))
    await saveSettings(root, { environment: "dev" })
    const collectionIds = new Set<string>()
    const backend = memoryBackend()
    setSecretBackendForTests({
      ...backend,
      async set(options) {
        collectionIds.add(options.name.split(":", 1)[0]!)
        await backend.set(options)
      },
    })

    let publications = 0
    let activePublications = 0
    let maxActivePublications = 0
    const realRename = fs.rename
    const settingsFiles = new Set([
      join(root, "settings.yml"),
      join(await fs.realpath(root), "settings.yml"),
    ])
    const publication = spyOn(fs, "rename").mockImplementation(
      async (from, to) => {
        if (!settingsFiles.has(String(to))) return realRename(from, to)
        publications += 1
        activePublications += 1
        maxActivePublications = Math.max(
          maxActivePublications,
          activePublications,
        )
        try {
          await Bun.sleep(25)
          return await realRename(from, to)
        } finally {
          activePublications -= 1
        }
      },
    )
    try {
      const results = await Promise.allSettled(
        Array.from({ length: 20 }, (_, index) =>
          setStoredSecret(root, "dev", `TOKEN_${index}`, `value-${index}`),
        ),
      )
      expect(results.every((result) => result.status === "fulfilled")).toBe(
        true,
      )
      const savedId = (await loadSettings(root)).collectionId
      expect(savedId).toBeDefined()
      expect(collectionIds).toEqual(new Set([savedId!]))
      expect(publications).toBe(1)
      expect(maxActivePublications).toBe(1)
    } finally {
      publication.mockRestore()
      await rm(root, { recursive: true, force: true })
    }
  })

  it("preserves the reserved id and releases its initialization lock after a failed publication", async () => {
    const root = await mkdtemp(join(tmpdir(), "noodle-secret-id-failure-"))
    await saveSettings(root, { environment: "dev", name: "Retained" })
    const canonical = await fs.realpath(root)
    const backend = memoryBackend()
    setSecretBackendForTests(backend)
    const realRename = fs.rename
    let publications = 0
    const publication = spyOn(fs, "rename").mockImplementation(
      async (from, to) => {
        if (String(to) === join(canonical, "settings.yml")) {
          publications += 1
          throw new Error("injected settings publication failure")
        }
        return realRename(from, to)
      },
    )
    try {
      await expect(
        setStoredSecret(root, "dev", "TOKEN", "value"),
      ).rejects.toThrow(
        "filestore.saveSettings: injected settings publication failure",
      )
      expect(publications).toBe(1)
      expect(backend.values.size).toBe(0)
      expect(await loadSettings(root)).toEqual({
        environment: "dev",
        name: "Retained",
      })
      expect(
        await Bun.file(
          join(root, ".noodle", "collection-id.lock", "owner"),
        ).exists(),
      ).toBe(false)
      const reservedId = await readFile(
        join(root, ".noodle", "collection-id"),
        "utf8",
      )
      publication.mockRestore()
      await setStoredSecret(root, "dev", "TOKEN", "value")
      expect(await loadSettings(root)).toEqual({
        collectionId: reservedId,
        environment: "dev",
        name: "Retained",
      })
      expect(
        await readFile(join(root, ".noodle", "collection-id"), "utf8"),
      ).toBe(reservedId)
      expect(await readdir(join(root, ".noodle"))).toEqual(["collection-id"])
    } finally {
      publication.mockRestore()
      await rm(root, { recursive: true, force: true })
    }
  })

  it("publishes one collection id across processes opening physical and linked paths", async () => {
    const parent = await mkdtemp(join(tmpdir(), "noodle-secret-process-"))
    const root = join(parent, "collection")
    const alias = join(parent, "linked")
    const shared = join(parent, "coordination")
    const startFile = join(shared, "start")
    await mkdir(root)
    await mkdir(shared)
    await symlink(
      root,
      alias,
      process.platform === "win32" ? "junction" : "dir",
    )
    await saveSettings(root, { environment: "dev", name: "Retained" })
    const fixture = resolve(
      import.meta.dir,
      "fixtures/collection-id-process.ts",
    )
    const children = [root, alias].map((directory, index) =>
      Bun.spawn(
        [process.execPath, fixture, directory, shared, startFile, `${index}`],
        {
          stdout: "pipe",
          stderr: "pipe",
        },
      ),
    )
    try {
      const deadline = Date.now() + 4000
      for (;;) {
        const entries = await readdir(shared)
        if (entries.includes("ready-0") && entries.includes("ready-1")) break
        if (Date.now() >= deadline)
          throw new Error("Collection id fixtures did not start")
        await Bun.sleep(10)
      }
      await writeFile(startFile, "start")
      const results = await Promise.all(
        children.map(async (child) => ({
          code: await child.exited,
          stdout: await new Response(child.stdout).text(),
          stderr: await new Response(child.stderr).text(),
        })),
      )
      expect(results).toEqual([
        { code: 0, stdout: "", stderr: "" },
        { code: 0, stdout: "", stderr: "" },
      ])
      const settings = await loadSettings(root)
      expect(settings).toMatchObject({ environment: "dev", name: "Retained" })
      expect(settings.collectionId).toBeDefined()
      for (const index of [0, 1]) {
        expect(await readFile(join(shared, `account-${index}`), "utf8")).toBe(
          secretAccount(settings.collectionId!, "dev", `TOKEN_${index}`),
        )
      }
      expect(
        (await readdir(shared)).filter((file) => file.startsWith("published-")),
      ).toHaveLength(1)
      expect(await readdir(join(root, ".noodle"))).toEqual(["collection-id"])
    } finally {
      for (const child of children) child.kill()
      await Promise.all(children.map((child) => child.exited))
      await rm(parent, { recursive: true, force: true })
    }
  }, 15_000)

  it("rejects empty values", async () => {
    const root = await mkdtemp(join(tmpdir(), "noodle-secret-empty-"))
    setSecretBackendForTests(memoryBackend())
    await expect(setStoredSecret(root, "dev", "TOKEN", "")).rejects.toThrow(
      "must not be empty",
    )
  })

  it("reports missing values and actionable credential backend failures", async () => {
    const root = await mkdtemp(join(tmpdir(), "noodle-secret-errors-"))
    const directory = join(root, ".environments")
    await mkdir(directory)
    await writeFile(join(directory, "dev.env"), "# @secret TOKEN\nTOKEN=\n")
    setSecretBackendForTests(memoryBackend())
    const missing = await env.loadEnvironment(directory, "dev")
    expect(missing.vars.TOKEN).toBeUndefined()
    expect(missing.secretVars?.TOKEN).toBe("missing")

    setSecretBackendForTests({
      async get() {
        throw new Error("backend unavailable")
      },
      async set() {
        throw new Error("backend unavailable")
      },
      async delete() {
        throw new Error("backend unavailable")
      },
    })
    await expect(env.loadEnvironment(directory, "dev")).rejects.toThrow(
      /secret read failed: backend unavailable.*credential|secret read failed: backend unavailable.*Secret Service/,
    )
    await expect(getAppSettingSecret("proxy:username")).rejects.toThrow(
      "secret read failed: backend unavailable",
    )
  })
})

describe("secret environment declarations", () => {
  it("round-trips enabled and disabled declarations without plaintext", async () => {
    const root = await mkdtemp(join(tmpdir(), "noodle-secret-env-"))
    const directory = join(root, ".environments")
    setSecretBackendForTests(memoryBackend())
    await env.saveEnvironment(directory, {
      name: "dev",
      vars: { URL: "https://example.com", TOKEN: "must-not-persist" },
      disabledVars: { OLD_TOKEN: "must-not-persist" },
      secretVars: { TOKEN: "keychain", OLD_TOKEN: "disabled" },
    })
    const raw = await readFile(join(directory, "dev.env"), "utf8")
    expect(raw).toContain("# @secret TOKEN\nTOKEN=")
    expect(raw).toContain("# @secret OLD_TOKEN\n# OLD_TOKEN=")
    expect(raw).not.toContain("must-not-persist")

    const loaded = await env.loadEnvironment(directory, "dev", {
      resolveSecrets: false,
    })
    expect(loaded.secretVars).toEqual({
      TOKEN: "missing",
      OLD_TOKEN: "disabled",
    })
  })

  it("rejects malformed declarations and plaintext secret placeholders", async () => {
    const root = await mkdtemp(join(tmpdir(), "noodle-secret-invalid-"))
    const directory = join(root, ".environments")
    await mkdir(directory)
    await writeFile(
      join(directory, "dev.env"),
      "# @secret TOKEN\nTOKEN=plaintext\n",
    )
    await expect(
      env.loadEnvironment(directory, "dev", { resolveSecrets: false }),
    ).rejects.toThrow("must have a blank value")
  })

  it("rejects malformed, duplicate, mismatched, and dangling declarations", async () => {
    const root = await mkdtemp(join(tmpdir(), "noodle-secret-strict-"))
    const directory = join(root, ".environments")
    await mkdir(directory)
    const cases = [
      ["# @secret\nTOKEN=\n", "invalid secret marker"],
      ["# @secret TOKEN\n", "dangling secret marker"],
      [
        "# @secret TOKEN\nOTHER=\n",
        'secret marker for "TOKEN" does not match "OTHER"',
      ],
      [
        "# @secret TOKEN\nTOKEN=\n# @secret TOKEN\nTOKEN=\n",
        "duplicate secret marker",
      ],
      ["# @secret TOKEN\n\nTOKEN=\n", 'dangling secret marker for "TOKEN"'],
    ] as const

    for (const [content, message] of cases) {
      await writeFile(join(directory, "dev.env"), content)
      await expect(
        env.loadEnvironment(directory, "dev", { resolveSecrets: false }),
      ).rejects.toThrow(message)
    }
  })
})

describe("secret automation services", () => {
  it("migrates plaintext, lists status, and deletes only the local value", async () => {
    const root = await mkdtemp(join(tmpdir(), "noodle-secret-service-"))
    const directory = join(root, ".environments")
    await saveSettings(root, {
      collectionId: "123e4567-e89b-42d3-a456-426614174000",
      environment: "dev",
    })
    await env.saveEnvironment(directory, {
      name: "dev",
      vars: { TOKEN: "old-plaintext" },
    })
    await saveRequest(root, {
      id: "example",
      name: "Example",
      method: "GET",
      url: "https://example.com/$TOKEN",
      timeout: 30_000,
      headers: {},
      params: [],
    })
    await saveTimelineEntry(root, "example", {
      timestamp: 1,
      request: {
        id: "example",
        name: "Example",
        method: "GET",
        url: "https://example.com/old-plaintext",
        headers: {},
        params: [],
      },
    })
    setSecretBackendForTests(memoryBackend())

    await secretSet("TOKEN", "new-secret", "dev", root)
    const raw = await readFile(join(directory, "dev.env"), "utf8")
    expect(raw).toContain("# @secret TOKEN\nTOKEN=")
    expect(raw).not.toContain("old-plaintext")
    expect((await loadTimeline(root, "example"))[0]?.request.url).toBe(
      "https://example.com/old-plaintext",
    )
    expect(await secretList("dev", root)).toEqual({
      environment: "dev",
      secrets: [{ key: "TOKEN", enabled: true, status: "keychain" }],
    })
    await expect(
      environmentSet("TOKEN", "plaintext", "dev", root),
    ).rejects.toThrow("noodle secret set")

    expect((await secretDelete("TOKEN", "dev", root)).deleted).toBe(true)
    const metadata = await env.loadEnvironment(directory, "dev", {
      resolveSecrets: false,
    })
    expect(metadata.secretVars?.TOKEN).toBe("missing")
  })
})
