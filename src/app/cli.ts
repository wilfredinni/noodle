#!/usr/bin/env bun
import { defineCommand, createMain } from "citty"
import pkg from "../../package.json" with { type: "json" }
import defaultCommand from "./commands/default"
import exportCommand from "./commands/export"
import importCommand from "./commands/import"
import updateCommand from "./commands/update"
import agentCommand from "./commands/agent"
import { getUserArgsStart } from "./argv"
import {
  workspace,
  collection,
  request,
  environment,
  secret,
  cookie,
} from "./commands/automation"

const rawArgs = process.argv.slice(2)
if (rawArgs.length === 1 && ["-v", "--version"].includes(rawArgs[0])) {
  console.log(pkg.version)
  process.exit(0)
}

const KNOWN_SUBCOMMANDS = new Set([
  "import",
  "export",
  "update",
  "agent",
  "workspace",
  "collection",
  "request",
  "environment",
  "secret",
  "cookie",
])

const userArgsStart = getUserArgsStart(process.argv)
const firstUserArg = process.argv[userArgsStart]

function isTuiFlag(arg: string): boolean {
  return (
    arg === "-c" ||
    arg === "-e" ||
    arg === "--noproxy" ||
    arg.startsWith("-c=") ||
    arg.startsWith("-e=") ||
    arg === "--collection" ||
    arg === "--env" ||
    arg.startsWith("--collection=") ||
    arg.startsWith("--env=")
  )
}

if (
  firstUserArg &&
  firstUserArg !== "noodle" &&
  !KNOWN_SUBCOMMANDS.has(firstUserArg) &&
  !firstUserArg.startsWith("-")
) {
  process.argv.splice(userArgsStart, 0, "noodle")
} else if (firstUserArg && isTuiFlag(firstUserArg)) {
  process.argv.splice(userArgsStart, 0, "noodle")
}

const main = defineCommand({
  meta: {
    name: "noodle",
    description:
      "Terminal REST client. Inspect, send, and iterate on HTTP requests.",
    version: pkg.version,
  },
  subCommands: {
    noodle: defaultCommand,
    import: importCommand,
    export: exportCommand,
    update: updateCommand,
    agent: agentCommand,
    workspace,
    collection,
    request,
    environment,
    secret,
    cookie,
  },
  default: "noodle",
})

await createMain(main)()
