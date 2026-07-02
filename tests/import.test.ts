import { describe, it, expect, afterEach } from "bun:test"
import { mkdtempSync, readFileSync, existsSync } from "node:fs"
import { writeFile, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"

describe("import — integration", () => {
  const tempDirs: string[] = []

  afterEach(async () => {
    for (const dir of tempDirs) {
      try {
        await rm(dir, { recursive: true, force: true })
      } catch {
        // ignore cleanup failures
      }
    }
    tempDirs.length = 0
  })

  function tempDir(): string {
    const dir = mkdtempSync(join(tmpdir(), "noodle-import-test-"))
    tempDirs.push(dir)
    return dir
  }

  it("imports OpenAPI spec with tags and servers, writes .yml files + folder.yml + .env", async () => {
    const outDir = tempDir()
    const specDir = tempDir()
    const specPath = join(specDir, "spec.json")

    const spec = {
      openapi: "3.0.0",
      info: { title: "Test API" },
      paths: {
        "/users": {
          get: { operationId: "listUsers", tags: ["users"] },
          post: {
            operationId: "createUser",
            parameters: [
              { name: "name", in: "query" },
              { name: "X-Token", in: "header" },
            ],
          },
        },
      },
      servers: [
        {
          url: "https://{host}/v1",
          description: "Default",
          variables: { host: { default: "api.example.com" } },
        },
      ],
    }
    await writeFile(specPath, JSON.stringify(spec))

    const { runImport } = await import("../src/app/import")
    await runImport(specPath, undefined, outDir)

    const collDir = join(outDir, "test-api")
    expect(existsSync(collDir)).toBe(true)

    const listUsersYml = readFileSync(
      join(collDir, "users", "get-users.yml"),
      "utf-8",
    )
    expect(listUsersYml).toContain("name: listUsers")
    expect(listUsersYml).toContain("method: GET")
    expect(listUsersYml).toContain("url: https://$host/v1/users")

    const createUserYml = readFileSync(
      join(collDir, "post-users.yml"),
      "utf-8",
    )
    expect(createUserYml).toContain("name: createUser")
    expect(createUserYml).toContain("method: POST")
    expect(createUserYml).toContain("params:")
    expect(createUserYml).toContain("name: ''")
    expect(createUserYml).toContain("X-Token: ''")

    expect(existsSync(join(collDir, "users", "folder.yml"))).toBe(true)

    const envPath = join(collDir, ".environments", "Default.env")
    expect(existsSync(envPath)).toBe(true)
    const envContent = readFileSync(envPath, "utf-8")
    expect(envContent).toContain("host=api.example.com")
  })

  it("imports spec with no tags or servers (all flat, no .env)", async () => {
    const outDir = tempDir()
    const specDir = tempDir()
    const specPath = join(specDir, "spec.json")

    const spec = {
      openapi: "3.0.0",
      info: { title: "Flat API" },
      paths: {
        "/a": { get: { operationId: "getA" } },
        "/b": { post: { operationId: "postB" } },
      },
    }
    await writeFile(specPath, JSON.stringify(spec))

    const { runImport } = await import("../src/app/import")
    await runImport(specPath, undefined, outDir)

    const collDir = join(outDir, "flat-api")
    expect(existsSync(join(collDir, "get-a.yml"))).toBe(true)
    expect(existsSync(join(collDir, "post-b.yml"))).toBe(true)
    expect(existsSync(join(collDir, ".environments"))).toBe(false)
  })

  it("outputs to --output dir when specified", async () => {
    const specDir = tempDir()
    const customOut = join(tempDir(), "custom-output")
    const specPath = join(specDir, "spec.json")

    const spec = {
      openapi: "3.0.0",
      info: { title: "Custom" },
      paths: { "/x": { get: { operationId: "getX" } } },
    }
    await writeFile(specPath, JSON.stringify(spec))

    const { runImport } = await import("../src/app/import")
    await runImport(specPath, undefined, customOut)

    const collDir = join(customOut, "custom")
    expect(existsSync(join(collDir, "get-x.yml"))).toBe(true)
  })
})
