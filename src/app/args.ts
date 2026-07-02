export interface ParsedArgs {
  collectionDir: string
  envName?: string
  help: boolean
  source?: string
  importFormat?: string
  outputDir?: string
}

const DEFAULT_COLLECTION_DIR = "./collections"

export function parseArgs(argv: string[]): ParsedArgs {
  let collectionDir: string | undefined
  let envName: string | undefined
  let help = false
  let source: string | undefined
  let importFormat: string | undefined
  let outputDir: string | undefined

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]

    if (arg === "-h" || arg === "--help") {
      help = true
      continue
    }

    if (arg === "--collection") {
      const next = argv[i + 1]
      if (next === undefined || next === "" || next.startsWith("-")) {
        throw new Error("args: --collection requires a value")
      }
      collectionDir = next
      i++
      continue
    }

    if (arg.startsWith("--collection=")) {
      const value = arg.slice("--collection=".length)
      if (value === "") {
        throw new Error("args: --collection requires a value")
      }
      collectionDir = value
      continue
    }

    if (arg === "--env") {
      const next = argv[i + 1]
      if (next === undefined || next === "" || next.startsWith("-")) {
        throw new Error("args: --env requires a value")
      }
      envName = next
      i++
      continue
    }

    if (arg.startsWith("--env=")) {
      const value = arg.slice("--env=".length)
      if (value === "") {
        throw new Error("args: --env requires a value")
      }
      envName = value
      continue
    }

    if (arg === "--source") {
      const next = argv[i + 1]
      if (next === undefined || next === "" || next.startsWith("-")) {
        throw new Error("args: --source requires a value")
      }
      source = next
      i++
      continue
    }

    if (arg.startsWith("--source=")) {
      const value = arg.slice("--source=".length)
      if (value === "") {
        throw new Error("args: --source requires a value")
      }
      source = value
      continue
    }

    if (arg === "--import") {
      const next = argv[i + 1]
      if (next === undefined || next === "" || next.startsWith("-")) {
        throw new Error("args: --import requires a value")
      }
      importFormat = next
      i++
      continue
    }

    if (arg.startsWith("--import=")) {
      const value = arg.slice("--import=".length)
      if (value === "") {
        throw new Error("args: --import requires a value")
      }
      importFormat = value
      continue
    }

    if (arg === "--output") {
      const next = argv[i + 1]
      if (next === undefined || next === "" || next.startsWith("-")) {
        throw new Error("args: --output requires a value")
      }
      outputDir = next
      i++
      continue
    }

    if (arg.startsWith("--output=")) {
      const value = arg.slice("--output=".length)
      if (value === "") {
        throw new Error("args: --output requires a value")
      }
      outputDir = value
      continue
    }

    if (arg.startsWith("-")) {
      throw new Error(`args: unknown flag "${arg}"`)
    }

    throw new Error(`args: unexpected positional argument "${arg}"`)
  }

  return {
    collectionDir: collectionDir ?? DEFAULT_COLLECTION_DIR,
    envName,
    help,
    source,
    importFormat,
    outputDir,
  }
}
