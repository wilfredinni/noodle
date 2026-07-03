import { defineCommand } from "citty"
import { runImport } from "../import"

export default defineCommand({
  meta: {
    name: "import",
    description: "Import OpenAPI or Postman spec into collection files",
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
        'Import format ("openapi", "postman") — auto-detected if omitted',
    },
    output: {
      type: "string",
      alias: "o",
      description: "Output directory (defaults to ./collections)",
    },
  },
  async run({ args }) {
    await runImport({
      source: args.source,
      format: args.format,
      outputDir: args.output,
    })
  },
})
