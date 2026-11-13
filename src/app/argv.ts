import type { ArgsDef, CommandDef } from "citty"
import { parseArgs, type ParseArgsConfig } from "node:util"

export function getUserArgsStart(argv: string[]): number {
  // Bun puts compiled entrypoints under /$bunfs; source runs may include
  // extra arguments before the .ts entrypoint (for example, `bun run`).
  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i]!
    if (arg.endsWith(".ts") || arg.includes("$bunfs")) {
      return i + 1
    }
  }

  // Standard executable argv is [executable, entrypoint, ...userArgs].
  return 2
}

// Citty accepts undeclared switches. Check the selected command before its handler runs.
export async function unknownCliOption(command: CommandDef, argv: string[]) {
  let args = argv
  while (command.subCommands) {
    const children = await (typeof command.subCommands === "function"
      ? command.subCommands()
      : command.subCommands)
    if (!Object.hasOwn(children, args[0]!)) break
    const child = children[args[0]!]!
    command = await (typeof child === "function" ? child() : child)
    args = args.slice(1)
  }

  const definitions: ArgsDef =
    (await (typeof command.args === "function"
      ? command.args()
      : command.args)) ?? {}
  const options: NonNullable<ParseArgsConfig["options"]> = Object.create(null)
  for (const [name, def] of Object.entries(definitions)) {
    if (def.type === "positional") continue
    const type = def.type === "boolean" ? "boolean" : "string"
    const aliases = "alias" in def ? [def.alias ?? []].flat() : []
    const camelName = name.replace(/-([a-z])/g, (_, c: string) =>
      c.toUpperCase(),
    )
    for (const key of [name, camelName, ...aliases]) {
      options[key] = { type, ...(key.length === 1 ? { short: key } : {}) }
      if (type === "boolean") options[`no-${key}`] = { type }
    }
  }
  const { tokens, values } = parseArgs({
    args,
    options,
    allowPositionals: true,
    strict: false,
    tokens: true,
  })
  const json =
    values.json !== undefined &&
    values.json !== "false" &&
    values["no-json"] === undefined
  const exitCode = argv[0] === "collection" && argv[1] === "run" ? 2 : 1
  for (const token of tokens) {
    if (token.kind !== "option") continue
    if (args[token.index] === "-h" || args[token.index] === "--help") continue
    if (!Object.hasOwn(options, token.name))
      return { message: `Unknown option: ${token.rawName}`, json, exitCode }
    if (
      token.inlineValue === false &&
      token.value?.startsWith("-") &&
      token.value.length > 1 &&
      !(token.name === "delay" && /^-\d+$/.test(token.value))
    )
      return {
        message: `Expected a value for ${token.rawName}. Use --${token.name}=VALUE for a value beginning with a dash`,
        json,
        exitCode,
      }
  }
}
