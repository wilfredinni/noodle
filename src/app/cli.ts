#!/usr/bin/env bun
import { defineCommand, createMain } from "citty"
import pkg from "../../package.json" with { type: "json" }
import defaultCommand from "./commands/default"
import importCommand from "./commands/import"
import updateCommand from "./commands/update"
import {
  workspace,
  collection,
  request,
  environment,
} from "./commands/automation"

const rawArgs = process.argv.slice(2)
if (rawArgs.length === 1 && ["-v", "--version"].includes(rawArgs[0])) {
  console.log(pkg.version)
  process.exit(0)
}

const main = defineCommand({
  meta: {
    name: "noodle",
    version: pkg.version,
  },
  subCommands: {
    noodle: defaultCommand,
    import: importCommand,
    update: updateCommand,
    workspace,
    collection,
    request,
    environment,
  },
  default: "noodle",
})

await createMain(main)()
