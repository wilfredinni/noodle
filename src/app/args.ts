export interface ParsedArgs {
  collectionDir: string
  envName?: string
  help: boolean
}

const DEFAULT_COLLECTION_DIR = "./collections"

export function parseArgs(argv: string[]): ParsedArgs {
  let collectionDir: string | undefined
  let envName: string | undefined
  let help = false

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

    if (arg.startsWith("-")) {
      throw new Error(`args: unknown flag "${arg}"`)
    }

    throw new Error(`args: unexpected positional argument "${arg}"`)
  }

  return {
    collectionDir: collectionDir ?? DEFAULT_COLLECTION_DIR,
    envName,
    help,
  }
}
