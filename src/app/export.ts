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
import { exportOpenApi } from "../converters/openapi"
import { env } from "../env"
import { filestore } from "../filestore"
import { serializeOpenApiYaml } from "../lang/openApiYaml"

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

async function environmentServers(collectionPath: string) {
  const directory = join(collectionPath, ".environments")
  const names = await env.listEnvironments(directory)
  const environments = await Promise.all(
    names.map(async (name) => {
      try {
        return await env.loadEnvironment(directory, name)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        throw new Error(
          `failed to load environment "${name}" for export: ${message}`,
          { cause: error },
        )
      }
    }),
  )
  return environments.flatMap(({ name, vars }) =>
    vars.base_url === "" || vars.base_url === undefined
      ? []
      : [{ url: vars.base_url, description: name }],
  )
}

async function resolvedOutputPath(path: string): Promise<string> {
  const suffix: string[] = []
  let current = path
  while (true) {
    try {
      return join(await realpath(current), ...suffix.reverse())
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        const message = error instanceof Error ? error.message : String(error)
        throw new Error(
          `failed to resolve export output path "${path}": ${message}`,
          {
            cause: error,
          },
        )
      }
      const parent = dirname(current)
      if (parent === current) {
        const message = error instanceof Error ? error.message : String(error)
        throw new Error(
          `failed to resolve export output path "${path}": ${message}`,
          {
            cause: error,
          },
        )
      }
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
  const exported = exportOpenApi(collection, {
    servers: await environmentServers(collectionPath),
  })

  try {
    await mkdir(dirname(outputPath), { recursive: true })
    await writeFile(outputPath, serializeOpenApiYaml(exported.document), "utf8")
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
