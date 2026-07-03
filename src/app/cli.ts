#!/usr/bin/env bun
import { defineCommand, createMain } from "citty"
import pkg from "../../package.json" with { type: "json" }
import defaultCommand from "./commands/default"
import importCommand from "./commands/import"

const main = defineCommand({
  meta: {
    name: "noodle",
    version: pkg.version,
  },
  subCommands: {
    noodle: defaultCommand,
    import: importCommand,
  },
  default: "noodle",
})

await createMain(main)()
