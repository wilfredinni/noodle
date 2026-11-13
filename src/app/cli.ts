#!/usr/bin/env bun
import { defineCommand, createMain } from "citty"
import pkg from "../../package.json" with { type: "json" }
import defaultCommand from "./commands/default"
import exportCommand from "./commands/export"
import importCommand from "./commands/import"
import updateCommand from "./commands/update"
import agentCommand from "./commands/agent"
import { emitCommand } from "./commandResult"
import { getUserArgsStart, invalidCliArgument } from "./argv"
import {
  workspace,
  collection,
  request,
  environment,
  secret,
  cookie,
} from "./commands/automation"

const rawArgs = process.argv.slice(2)
if (process.env.NOODLE_TEST_SCRIPT_DIAGNOSTICS === "1") {
  const { verifyBundledScriptDiagnostics } =
    await import("../ui/editor/scriptDiagnosticsSmoke")
  await verifyBundledScriptDiagnostics()
  console.log("bundled semantic diagnostics passed")
  process.exit(0)
}
if (rawArgs.length === 1 && ["-v", "--version"].includes(rawArgs[0])) {
  console.log(pkg.version)
  process.exit(0)
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

const args = process.argv.slice(getUserArgsStart(process.argv))
const first = args[0]
if (
  first &&
  !["-h", "--help"].includes(first) &&
  !Object.hasOwn(main.subCommands!, first)
) {
  args.unshift("noodle")
}
const invalid = await invalidCliArgument(main, args)
if (invalid) {
  await emitCommand(
    invalid.json,
    async () => {
      throw new Error(invalid.message)
    },
    undefined,
    invalid.exitCode,
  )
} else {
  await createMain(main)({ rawArgs: args })
}
