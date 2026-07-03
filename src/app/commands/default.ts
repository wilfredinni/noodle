import { defineCommand } from "citty"
import { bootstrap } from "../main"

export default defineCommand({
  meta: {
    name: "noodle",
    description: "Terminal REST client. Inspect, send, and iterate on HTTP requests.",
  },
  args: {
    collection: {
      type: "string",
      default: "./collections",
      alias: "c",
      description: "Collection directory",
    },
    env: {
      type: "string",
      alias: "e",
      description: "Initial environment name",
    },
  },
  async run({ args }) {
    await bootstrap({
      collectionDir: args.collection,
      envName: args.env,
    })
  },
})
