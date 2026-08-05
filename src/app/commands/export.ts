import { defineCommand } from "citty"
import { emitCommand } from "../commandResult"
import { formatExport } from "../humanOutput"

export default defineCommand({
  meta: {
    name: "export",
    description:
      "Export a Noodle collection to an API specification or Postman bundle",
  },
  args: {
    collection: {
      type: "positional",
      required: true,
      description: "Collection directory",
    },
    format: {
      type: "string",
      required: true,
      description: 'Export format ("openapi" or "postman")',
    },
    output: {
      type: "string",
      alias: "o",
      required: true,
      description: "Output file (OpenAPI) or empty directory (Postman)",
    },
    json: {
      type: "boolean",
      default: false,
      description: "Write one JSON result envelope to stdout",
    },
  },
  async run({ args }) {
    const { runExport } = await import("../export")
    await emitCommand(
      args.json,
      async () => ({
        data: await runExport({
          collection: args.collection,
          format: args.format,
          output: args.output,
        }),
      }),
      formatExport,
    )
  },
})
