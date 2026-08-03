import { mkdir, realpath, writeFile } from "node:fs/promises"
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path"
import yaml from "js-yaml"
import { exportOpenApi } from "../converters/openapi"
import { filestore } from "../filestore"
import { isRawJsonNumber } from "../lang/formatJson"

export interface ExportOptions {
  collection: string
  format: string
  output: string
}

export interface ExportResult {
  path: string
  name: string
  format: string
  operationCount: number
}

const RAW_JSON_INT_RE = /^-?(?:0|[1-9]\d*)$/

const rawJsonIntType = new yaml.Type("tag:yaml.org,2002:int", {
  kind: "scalar",
  resolve: () => false,
  predicate: (value: object) =>
    isRawJsonNumber(value) && RAW_JSON_INT_RE.test(value.rawJSON),
  represent: (value: object) => (value as { rawJSON: string }).rawJSON,
})

const rawJsonFloatType = new yaml.Type("tag:yaml.org,2002:float", {
  kind: "scalar",
  resolve: () => false,
  predicate: (value: object) =>
    isRawJsonNumber(value) && !RAW_JSON_INT_RE.test(value.rawJSON),
  represent: (value: object) => (value as { rawJSON: string }).rawJSON,
})

const openApiYamlSchema = yaml.DEFAULT_SCHEMA.extend({
  implicit: [rawJsonIntType, rawJsonFloatType],
})

async function resolvedOutputPath(path: string): Promise<string> {
  const suffix: string[] = []
  let current = path
  while (true) {
    try {
      return join(await realpath(current), ...suffix.reverse())
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
      const parent = dirname(current)
      if (parent === current) throw error
      suffix.push(basename(current))
      current = parent
    }
  }
}

function isWithin(root: string, path: string): boolean {
  const pathRelative = relative(root, path)
  return (
    pathRelative === "" ||
    (!pathRelative.startsWith(`..${sep}`) &&
      pathRelative !== ".." &&
      !isAbsolute(pathRelative))
  )
}

export async function runExport(options: ExportOptions): Promise<ExportResult> {
  if (options.format !== "openapi") {
    throw new Error(
      `unknown export format "${options.format}". Supported: openapi`,
    )
  }

  const collectionPath = resolve(options.collection)
  const outputPath = resolve(options.output)
  const collection = await filestore.loadCollection(collectionPath, {
    readOnly: true,
  })
  const collectionRoot = await realpath(collectionPath)
  if (isWithin(collectionRoot, await resolvedOutputPath(outputPath))) {
    throw new Error("export output must be outside the collection directory")
  }
  const exported = exportOpenApi(collection)

  try {
    await mkdir(dirname(outputPath), { recursive: true })
    await writeFile(
      outputPath,
      yaml.dump(exported.document, { noRefs: true, schema: openApiYamlSchema }),
      "utf8",
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`failed to write export: ${message}`, { cause: error })
  }

  return {
    path: outputPath,
    name: collection.name,
    format: options.format,
    operationCount: exported.operationCount,
  }
}
