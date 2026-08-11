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
            requestBody: {
              content: {
                "application/json": {
                  schema: { example: { name: "Ada" } },
                },
              },
            },
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

    const { runImport } = await import("../../src/app/import")
    await runImport({ source: specPath, format: undefined, outputDir: outDir })

    const collDir = join(outDir, "test-api")
    expect(existsSync(collDir)).toBe(true)
    expect(readFileSync(join(collDir, "settings.yml"), "utf8")).toMatch(
      /^collection_id: [0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\s*$/im,
    )

    const listUsersYml = readFileSync(
      join(collDir, "users", "get-users.yml"),
      "utf-8",
    )
    expect(listUsersYml).toContain("name: listUsers")
    expect(listUsersYml).toContain("method: GET")
    expect(listUsersYml).toContain("url: https://$host/v1/users")

    const createUserYml = readFileSync(join(collDir, "post-users.yml"), "utf-8")
    expect(createUserYml).toContain("name: createUser")
    expect(createUserYml).toContain("method: POST")
    expect(createUserYml).toContain("params:")
    expect(createUserYml).toContain("- name: name")
    expect(createUserYml).toContain("value: ''")
    expect(createUserYml).toContain("X-Token: ''")
    expect(createUserYml).toContain('body: |-\n  {\n    "name": "Ada"\n  }')

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

    const { runImport } = await import("../../src/app/import")
    await runImport({ source: specPath, format: undefined, outputDir: outDir })

    const collDir = join(outDir, "flat-api")
    expect(existsSync(join(collDir, "get-a.yml"))).toBe(true)
    expect(existsSync(join(collDir, "post-b.yml"))).toBe(true)
    expect(existsSync(join(collDir, ".environments"))).toBe(false)
  })

  it("writes inferred OpenAPI path params to request YAML", async () => {
    const outDir = tempDir()
    const specDir = tempDir()
    const specPath = join(specDir, "spec.json")

    await writeFile(
      specPath,
      JSON.stringify({
        openapi: "3.0.0",
        info: { title: "Path Params" },
        paths: {
          "/users/{id}": { get: { operationId: "getUser" } },
        },
      }),
    )

    const { runImport } = await import("../../src/app/import")
    await runImport({ source: specPath, format: undefined, outputDir: outDir })

    expect(
      readFileSync(join(outDir, "path-params", "get-users-id.yml"), "utf-8"),
    ).toContain("path_params:\n  - name: id\n    value: ''")
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

    const { runImport } = await import("../../src/app/import")
    await runImport({
      source: specPath,
      format: undefined,
      outputDir: customOut,
    })

    const collDir = join(customOut, "custom")
    expect(existsSync(join(collDir, "get-x.yml"))).toBe(true)
  })

  it("auto-detects Swagger 2.0 and writes requests and its environment", async () => {
    const outDir = tempDir()
    const specDir = tempDir()
    const specPath = join(specDir, "swagger.yaml")
    await writeFile(
      specPath,
      'swagger: "2.0"\ninfo:\n  title: Swagger API\nhost: api.example.com\npaths:\n  /ping:\n    get:\n      operationId: ping\n',
    )

    const { runImport } = await import("../../src/app/import")
    await runImport({ source: specPath, outputDir: outDir })

    expect(existsSync(join(outDir, "swagger-api", "get-ping.yml"))).toBe(true)
    expect(
      readFileSync(
        join(outDir, "swagger-api", ".environments", "default.env"),
        "utf-8",
      ),
    ).toContain("base_url=https://api.example.com/")
  })

  it("auto-detects an Insomnia export and writes nested requests and environments", async () => {
    const outDir = tempDir()
    const specDir = tempDir()
    const specPath = join(specDir, "insomnia.json")
    await writeFile(
      specPath,
      JSON.stringify({
        _type: "export",
        __export_format: 4,
        resources: [
          {
            _id: "req_ping",
            _type: "request",
            parentId: "folder_health",
            name: "Ping",
            method: "GET",
            url: "https://{{ host }}/ping",
            headers: [],
            parameters: [],
            body: {},
            authentication: { type: "bearer", token: "{{ token }}" },
          },
          {
            _id: "folder_health",
            _type: "request_group",
            parentId: "workspace",
            name: "Health",
          },
          {
            _id: "environment",
            _type: "environment",
            parentId: "workspace",
            name: "Development",
            data: {
              host: "api.example.com",
              token: "secret",
              note: "first\r\nsecond\nthird\rfourth",
            },
          },
          {
            _id: "workspace",
            _type: "workspace",
            parentId: null,
            name: "Insomnia API",
          },
        ],
      }),
    )

    const { runImport } = await import("../../src/app/import")
    await runImport({ source: specPath, outputDir: outDir })

    expect(
      existsSync(join(outDir, "insomnia-api", "health", "folder.yml")),
    ).toBe(true)
    const pingYml = readFileSync(
      join(outDir, "insomnia-api", "health", "get-ping.yml"),
      "utf-8",
    )
    expect(pingYml).toContain("url: https://$host/ping")
    expect(pingYml).toContain("auth:\n  type: bearer\n  token: $token")
    expect(
      readFileSync(
        join(outDir, "insomnia-api", ".environments", "Development.env"),
        "utf-8",
      ),
    ).toContain("token=secret")
    const { env } = await import("../../src/env")
    const environment = await env.loadEnvironment(
      join(outDir, "insomnia-api", ".environments"),
      "Development",
    )
    expect(environment.vars.note).toBe("first\\nsecond\\nthird\\nfourth")
  })

  it("preserves large JSON integers in imported Postman request bodies", async () => {
    const outDir = tempDir()
    const specDir = tempDir()
    const specPath = join(specDir, "collection.json")
    await writeFile(
      specPath,
      JSON.stringify({
        info: {
          name: "Large IDs",
          schema:
            "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
        },
        item: [
          {
            name: "Create",
            request: {
              method: "POST",
              url: "https://example.com",
              header: [],
              body: {
                mode: "raw",
                raw: '{"id":9007199254740993}',
                options: { raw: { language: "json" } },
              },
            },
          },
        ],
      }),
    )

    const { runImport } = await import("../../src/app/import")
    await runImport({ source: specPath, format: "postman", outputDir: outDir })

    expect(
      readFileSync(join(outDir, "large-ids", "post-create.yml"), "utf8"),
    ).toContain('body: |-\n  {\n    "id": 9007199254740993\n  }')
  })

  it("imports directly into the current collection without reformatting existing requests", async () => {
    const collectionDir = tempDir()
    const specDir = tempDir()
    const specPath = join(specDir, "spec.json")
    const existing = [
      "name: Existing",
      "method: POST",
      "url: https://example.com",
      "timeout: 0",
      "body: '{\"existing\":true}'",
      "headers: {}",
      "params: []",
      "",
    ].join("\n")
    await writeFile(join(collectionDir, "existing.yml"), existing)
    await writeFile(
      specPath,
      JSON.stringify({
        openapi: "3.0.0",
        info: { title: "Imported API" },
        paths: {
          "/users": {
            post: {
              operationId: "createUser",
              requestBody: {
                content: {
                  "application/json": {
                    schema: { example: { name: "Ada" } },
                  },
                },
              },
            },
          },
        },
      }),
    )

    const { runImport } = await import("../../src/app/import")
    await runImport({
      source: specPath,
      destination: { kind: "current", collectionDir },
    })

    expect(readFileSync(join(collectionDir, "existing.yml"), "utf8")).toBe(
      existing,
    )
    expect(
      readFileSync(join(collectionDir, "post-users.yml"), "utf8"),
    ).toContain('body: |-\n  {\n    "name": "Ada"\n  }')
  })

  it("aborts a current-collection import before any writes when paths conflict", async () => {
    const collectionDir = tempDir()
    const specDir = tempDir()
    const specPath = join(specDir, "spec.json")
    const existing = "existing content\n"
    await writeFile(join(collectionDir, "get-users.yml"), existing)
    await writeFile(
      specPath,
      JSON.stringify({
        openapi: "3.0.0",
        info: { title: "Conflict API" },
        paths: {
          "/users": { get: { operationId: "listUsers" } },
          "/health": { get: { operationId: "health" } },
        },
      }),
    )

    const { runImport } = await import("../../src/app/import")
    await expect(
      runImport({
        source: specPath,
        destination: { kind: "current", collectionDir },
      }),
    ).rejects.toThrow("import conflicts:\nget-users.yml")

    expect(readFileSync(join(collectionDir, "get-users.yml"), "utf8")).toBe(
      existing,
    )
    expect(existsSync(join(collectionDir, "get-health.yml"))).toBe(false)
  })

  it("creates a marked new collection and rejects an existing target", async () => {
    const parentDir = tempDir()
    const specDir = tempDir()
    const specPath = join(specDir, "spec.json")
    await writeFile(
      specPath,
      JSON.stringify({
        openapi: "3.0.0",
        info: { title: "New API" },
        paths: { "/ping": { get: { operationId: "ping" } } },
      }),
    )

    const { runImport } = await import("../../src/app/import")
    const first = await runImport({
      source: specPath,
      destination: { kind: "new", parentDir },
    })

    expect(first.path).toBe(join(parentDir, "new-api"))
    expect(existsSync(join(first.path, "settings.yml"))).toBe(true)
    expect(existsSync(join(first.path, ".environments"))).toBe(false)
    await expect(
      runImport({
        source: specPath,
        destination: { kind: "new", parentDir },
      }),
    ).rejects.toThrow(`import target already exists: ${first.path}`)
  })

  it("removes a partial new collection after a late write failure", async () => {
    const parentDir = tempDir()
    const specDir = tempDir()
    const specPath = join(specDir, "cleanup.json")
    await writeFile(specPath, "{}")

    let failEnvironmentWrite = true
    const { registerImporter } = await import("../../src/converters")
    registerImporter({
      type: "cleanup-test",
      detect: () => false,
      import: () => ({
        collection: {
          id: "cleanup-test",
          name: "Cleanup Test",
          items: [
            {
              type: "request",
              data: {
                id: "get-ping",
                name: "Ping",
                method: "GET",
                url: "https://example.com/ping",
                timeout: 0,
                headers: {},
                params: [],
              },
            },
          ],
        },
        environments: [
          {
            name: "default",
            vars: failEnvironmentWrite
              ? Object.defineProperty({}, "token", {
                  enumerable: true,
                  get: () => {
                    throw new Error("environment serialization failed")
                  },
                })
              : { token: "ok" },
          },
        ],
      }),
    })

    const { runImport } = await import("../../src/app/import")
    const target = join(parentDir, "cleanup-test")
    await expect(
      runImport({
        source: specPath,
        format: "cleanup-test",
        silent: true,
        destination: { kind: "new", parentDir },
      }),
    ).rejects.toThrow("environment serialization failed")
    expect(existsSync(target)).toBe(false)

    failEnvironmentWrite = false
    await expect(
      runImport({
        source: specPath,
        format: "cleanup-test",
        silent: true,
        destination: { kind: "new", parentDir },
      }),
    ).resolves.toMatchObject({ path: target })
  })

  it("auto-detects every provider for current and new destinations", async () => {
    const providers = [
      {
        name: "OpenAPI",
        collectionId: "openapi-destinations",
        requestPath: "get-openapi.yml",
        content: JSON.stringify({
          openapi: "3.0.0",
          info: { title: "OpenAPI Destinations" },
          paths: { "/openapi": { get: { operationId: "openapi" } } },
        }),
      },
      {
        name: "Swagger",
        collectionId: "swagger-destinations",
        requestPath: "get-swagger.yml",
        content:
          'swagger: "2.0"\ninfo:\n  title: Swagger Destinations\npaths:\n  /swagger:\n    get:\n      operationId: swagger\n',
      },
      {
        name: "Postman",
        collectionId: "postman-destinations",
        requestPath: "get-postman.yml",
        content: JSON.stringify({
          info: {
            name: "Postman Destinations",
            schema:
              "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
          },
          item: [
            {
              name: "Postman",
              request: { method: "GET", url: "https://example.com/postman" },
            },
          ],
        }),
      },
      {
        name: "Insomnia",
        collectionId: "insomnia-destinations",
        requestPath: "get-insomnia.yml",
        content: JSON.stringify({
          _type: "export",
          __export_format: 4,
          resources: [
            {
              _id: "workspace",
              _type: "workspace",
              parentId: null,
              name: "Insomnia Destinations",
            },
            {
              _id: "request",
              _type: "request",
              parentId: "workspace",
              name: "Insomnia",
              method: "GET",
              url: "https://example.com/insomnia",
              headers: [],
              parameters: [],
              body: {},
              authentication: {},
            },
          ],
        }),
      },
    ]

    const { runImport } = await import("../../src/app/import")
    for (const provider of providers) {
      const specDir = tempDir()
      const specPath = join(specDir, `${provider.name.toLowerCase()}.json`)
      await writeFile(specPath, provider.content)

      const currentDir = tempDir()
      await runImport({
        source: specPath,
        destination: { kind: "current", collectionDir: currentDir },
      })
      expect(existsSync(join(currentDir, provider.requestPath))).toBe(true)

      const parentDir = tempDir()
      const result = await runImport({
        source: specPath,
        destination: { kind: "new", parentDir },
      })
      expect(result.path).toBe(join(parentDir, provider.collectionId))
      expect(existsSync(join(result.path, provider.requestPath))).toBe(true)
      expect(existsSync(join(result.path, "settings.yml"))).toBe(true)
    }
  })

  it("rejects duplicate planned paths before writing anything", async () => {
    const collectionDir = tempDir()
    const specDir = tempDir()
    const specPath = join(specDir, "duplicate.json")
    await writeFile(specPath, "{}")

    const { runImport } = await import("../../src/app/import")
    const { registerImporter } = await import("../../src/converters")
    const duplicateRequest = {
      id: "get-ping",
      name: "Ping",
      method: "GET" as const,
      url: "https://example.com/ping",
      timeout: 0,
      headers: {},
      params: [],
    }
    registerImporter({
      type: "duplicate-test",
      detect: () => false,
      import: () => ({
        collection: {
          id: "duplicate-test",
          name: "Duplicate Test",
          items: [
            { type: "request", data: duplicateRequest },
            { type: "request", data: duplicateRequest },
          ],
        },
        environments: [],
      }),
    })
    await expect(
      runImport({
        source: specPath,
        format: "duplicate-test",
        destination: { kind: "current", collectionDir },
      }),
    ).rejects.toThrow("import conflicts:\nget-ping.yml")
    expect(existsSync(join(collectionDir, "get-ping.yml"))).toBe(false)
  })
})
