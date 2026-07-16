import { defineCommand } from "citty"
import { resolve } from "node:path"
import { bootstrap } from "../main"

export default defineCommand({
  meta: {
    name: "noodle",
    description:
      "Terminal REST client. Inspect, send, and iterate on HTTP requests.",
  },
  args: {
    targetPath: {
      type: "positional" as const,
      required: false,
      description:
        "Collection directory (use '.' for current dir). Overrides --collection and config.yml.",
    },
    collection: {
      type: "string" as const,
      alias: "c",
      description: "Collection directory",
    },
    env: {
      type: "string" as const,
      alias: "e",
      description: "Initial environment name",
    },
  },
  async run({ args }) {
    if (args.targetPath && args.collection) {
      process.stderr.write(
        "error: cannot supply both a positional path and --collection\n",
      )
      process.exit(1)
    }

    await bootstrap({
      targetPath: args.targetPath ? resolve(args.targetPath) : undefined,
      collectionDir: args.collection ? resolve(args.collection) : undefined,
      envName: args.env,
    })
  },
})
