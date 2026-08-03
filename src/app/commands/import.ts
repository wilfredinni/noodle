import { defineCommand } from "citty"
import { emitCommand } from "../commandResult"
import { formatImport } from "../humanOutput"

export default defineCommand({
  meta: {
    name: "import",
    description:
      "Import OpenAPI, Swagger, Postman, or Insomnia spec into collection files",
  },
  args: {
    source: {
      type: "positional",
      required: true,
      description: "Source spec file (JSON or YAML)",
    },
    format: {
      type: "string",
      alias: "i",
      description:
        'Import format ("openapi", "swagger", "postman", "insomnia") — auto-detected if omitted',
    },
    output: {
      type: "string",
      alias: "o",
      default: "./collections",
      description: "Output directory",
    },
    json: {
      type: "boolean",
      default: false,
      description: "Write one JSON result envelope to stdout",
    },
  },
  async run({ args }) {
    const { runImport } = await import("../import")
    if (args.json)
      return emitCommand(true, async () => ({
        data: await runImport({
          source: args.source,
          format: args.format,
          outputDir: args.output,
          silent: true,
        }),
      }))
    await emitCommand(
      false,
      async () => ({
        data: await runImport({
          source: args.source,
          format: args.format,
          outputDir: args.output,
          silent: true,
        }),
      }),
      formatImport,
    )
  },
})
