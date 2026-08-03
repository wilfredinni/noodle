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

  it("writes an OpenAPI YAML file without mutating requests or exporting environment data", async () => {
    const collection = await tempDir()
    const output = join(await tempDir(), "nested", "openapi.yml")
    const requestPath = join(collection, "health.yml")
    const source = [
      "name: Health",
      "method: GET",
      "url: https://$host/health",
      "headers:",
      "  X-Token: $TOKEN",
      "",
    ].join("\n")
    await writeFile(requestPath, source, "utf8")
    await mkdir(join(collection, ".environments"))
    await writeFile(
      join(collection, ".environments", "production.env"),
      "host=api.example.com\nTOKEN=should-not-export\n",
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
        url: "https://{host}",
        variables: { host: { default: "" } },
      },
    ])
    expect(document.paths["/health"]?.get.parameters).toContainEqual({
      name: "X-Token",
      in: "header",
      required: false,
      schema: { type: "string" },
      example: "$TOKEN",
    })
    expect(outputText).not.toContain("api.example.com")
    expect(outputText).not.toContain("should-not-export")
    expect(outputText).not.toContain("timeline-secret")
  })

  it("rejects unsupported output formats", async () => {
    const collection = await tempDir()
    await expect(
      runExport({
        collection,
        format: "postman",
        output: join(collection, "export.yml"),
      }),
    ).rejects.toThrow('unknown export format "postman". Supported: openapi')
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
