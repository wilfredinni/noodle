#!/usr/bin/env bun
import { defineCommand, createMain } from "citty"
import pkg from "../../package.json" with { type: "json" }
import defaultCommand from "./commands/default"
import importCommand from "./commands/import"
import updateCommand from "./commands/update"

const main = defineCommand({
  meta: {
    name: "noodle",
    version: pkg.version,
  },
  subCommands: {
    noodle: defaultCommand,
    import: importCommand,
    update: updateCommand,
  },
  default: "noodle",
})

await createMain(main)()
