import { afterEach, describe, expect, it } from "bun:test"
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, join } from "node:path"
import yaml from "js-yaml"
import { runExport } from "../../src/app/export"

type OpenApiDocument = {
  openapi: string
  servers?: unknown
  paths: Record<string, Record<string, { parameters?: unknown[] }>>
}

describe("export — integration", () => {
  const tempDirs: string[] = []

  afterEach(async () => {
    for (const dir of tempDirs) {
      await rm(dir, { recursive: true, force: true })
    }
    tempDirs.length = 0
  })

  async function tempDir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "noodle-export-test-"))
    tempDirs.push(dir)
    return dir
  }

  it("writes environment base URLs as OpenAPI servers without exporting other environment data", async () => {
    const collection = await tempDir()
    const output = join(await tempDir(), "nested", "openapi.yml")
    const requestPath = join(collection, "health.yml")
    const source = [
      "name: Health",
      "method: GET",
      "url: $base_url/health",
      "headers:",
      "  X-Token: $TOKEN",
      "",
    ].join("\n")
    await writeFile(requestPath, source, "utf8")
    await mkdir(join(collection, ".environments"))
    await writeFile(
      join(collection, ".environments", "production.env"),
      [
        "base_url=https://api.example.com",
        "TOKEN=should-not-export",
        "_color=success",
        "#DISABLED=also-not-exported",
        "",
      ].join("\n"),
      "utf8",
    )
    await writeFile(
      join(collection, ".environments", "staging.env"),
      "base_url=https://api.example.com\n",
      "utf8",
    )
    await writeFile(
      join(collection, ".environments", "empty.env"),
      "base_url=\n",
      "utf8",
    )
    await writeFile(
      join(collection, ".environments", "disabled.env"),
      "#base_url=https://disabled.example\n",
      "utf8",
    )
    await mkdir(join(collection, ".timeline"))
    await writeFile(
      join(collection, ".timeline", "health.yml"),
      "timeline-secret\n",
      "utf8",
    )

    const result = await runExport({
      collection,
      format: "openapi",
      output,
    })

    expect(result).toEqual({
      path: output,
      name: basename(collection),
      format: "openapi",
      operationCount: 1,
    })
    expect(await readFile(requestPath, "utf8")).toBe(source)

    const outputText = await readFile(output, "utf8")
    const document = yaml.load(outputText) as OpenApiDocument
    expect(document.openapi).toBe("3.0.3")
    expect(document.servers).toEqual([
      {
        url: "https://api.example.com",
        description: "production",
      },
      {
        url: "https://api.example.com",
        description: "staging",
      },
    ])
    expect(document.paths["/health"]?.get.parameters).toContainEqual({
      name: "X-Token",
      in: "header",
      required: false,
      schema: { type: "string" },
      example: "$TOKEN",
    })
    expect(outputText).not.toContain("should-not-export")
    expect(outputText).not.toContain("also-not-exported")
    expect(outputText).not.toContain("disabled.example")
    expect(outputText).not.toContain("timeline-secret")
  })

  it("fails with context when an environment cannot be parsed", async () => {
    const collection = await tempDir()
    const output = join(await tempDir(), "openapi.yml")
    await writeFile(
      join(collection, "health.yml"),
      "name: Health\nmethod: GET\nurl: $base_url/health\n",
      "utf8",
    )
    await mkdir(join(collection, ".environments"))
    await writeFile(
      join(collection, ".environments", "broken.env"),
      "not a dotenv line\n",
      "utf8",
    )

    await expect(
      runExport({ collection, format: "openapi", output }),
    ).rejects.toThrow(
      'failed to load environment "broken" for export: env.load: invalid line (expected KEY=value): "not a dotenv line"',
    )
  })

  it("rejects unsupported output formats", async () => {
    const collection = await tempDir()
    await expect(
      runExport({
        collection,
        format: "invalid",
        output: join(collection, "export.yml"),
      }),
    ).rejects.toThrow(
      'unknown export format "invalid". Supported: openapi, postman',
    )
  })

  it("writes a Postman bundle with redacted environment values", async () => {
    const collection = await tempDir()
    const output = join(await tempDir(), "postman")
    await writeFile(
      join(collection, "health.yml"),
      [
        "name: Health",
        "method: GET",
        "url: $base_url/health?source=noodle",
        "headers:",
        "  Authorization: Bearer $TOKEN",
        "",
      ].join("\n"),
      "utf8",
    )
    await mkdir(join(collection, ".environments"))
    await writeFile(
      join(collection, ".environments", "production.env"),
      "base_url=https://api.example.com\nTOKEN=should-not-export\n#OLD=also-not-export\n_color=success\n",
      "utf8",
    )
    await mkdir(join(collection, ".timeline"))
    await writeFile(
      join(collection, ".timeline", "health.yml"),
      "timeline-secret",
    )

    const result = await runExport({ collection, format: "postman", output })
    const collectionFile = join(output, "collection.postman_collection.json")
    const environmentFile = join(output, "production.postman_environment.json")
    expect(result).toEqual({
      path: output,
      name: basename(collection),
      format: "postman",
      operationCount: 1,
      environmentCount: 1,
      files: [collectionFile, environmentFile],
    })
    expect(JSON.parse(await readFile(collectionFile, "utf8"))).toMatchObject({
      info: {
        schema:
          "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
      },
    })
    const environmentText = await readFile(environmentFile, "utf8")
    expect(environmentText).toContain('"value": ""')
    expect(environmentText).not.toContain("should-not-export")
    expect(environmentText).not.toContain("also-not-export")
    expect(environmentText).not.toContain("success")
    expect(environmentText).not.toContain("timeline-secret")
  })

  it("requires a new or empty Postman output directory", async () => {
    const collection = await tempDir()
    await writeFile(
      join(collection, "health.yml"),
      "name: Health\nmethod: GET\nurl: https://example.com/health\n",
      "utf8",
    )
    const root = await tempDir()
    const nonempty = join(root, "nonempty")
    const file = join(root, "file")
    await mkdir(nonempty)
    await writeFile(join(nonempty, "existing"), "")
    await writeFile(file, "")

    await expect(
      runExport({ collection, format: "postman", output: nonempty }),
    ).rejects.toThrow("postman export output directory must be empty")
    await expect(
      runExport({ collection, format: "postman", output: file }),
    ).rejects.toThrow("postman export output must be a directory")
  })

  it("rejects outputs inside the collection without changing requests", async () => {
    const collection = await tempDir()
    const requestPath = join(collection, "health.yml")
    const source =
      "name: Health\nmethod: GET\nurl: https://example.com/health\n"
    await writeFile(requestPath, source, "utf8")

    for (const output of [
      requestPath,
      join(collection, "specs", "openapi.yml"),
    ]) {
      await expect(
        runExport({ collection, format: "openapi", output }),
      ).rejects.toThrow(
        "export output must be outside the collection directory",
      )
    }

    const link = join(await tempDir(), "collection-link")
    await symlink(collection, link, "dir")
    await expect(
      runExport({
        collection,
        format: "openapi",
        output: join(link, "openapi.yml"),
      }),
    ).rejects.toThrow("export output must be outside the collection directory")

    await expect(
      runExport({
        collection,
        format: "postman",
        output: join(collection, "postman"),
      }),
    ).rejects.toThrow("export output must be outside the collection directory")

    expect(await readFile(requestPath, "utf8")).toBe(source)
    expect(
      await Bun.file(join(collection, "specs", "openapi.yml")).exists(),
    ).toBe(false)
  })

  it("adds context when the export output cannot be resolved", async () => {
    const collection = await tempDir()
    const outputParent = join(await tempDir(), "not-a-directory")
    await writeFile(outputParent, "", "utf8")

    await expect(
      runExport({
        collection,
        format: "openapi",
        output: join(outputParent, "openapi.yml"),
      }),
    ).rejects.toThrow("failed to resolve export output path")
  })

  it("preserves exact JSON number literals in exported YAML", async () => {
    const collection = await tempDir()
    const output = join(await tempDir(), "openapi.yml")
    await writeFile(
      join(collection, "numbers.yml"),
      [
        "name: Numbers",
        "method: POST",
        "url: https://example.com/numbers",
        'body: \'{"integer":9007199254740993,"decimal":0.12345678901234567890}\'',
        "",
      ].join("\n"),
      "utf8",
    )

    await runExport({ collection, format: "openapi", output })

    const outputText = await readFile(output, "utf8")
    expect(outputText).toContain("9007199254740993")
    expect(outputText).toContain("0.12345678901234567890")
    expect(outputText).not.toContain("9007199254740992")
  })
})
