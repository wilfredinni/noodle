import { resolve } from "node:path"

const root = resolve(import.meta.dir, "..")
const result = await Bun.build({
  entrypoints: [resolve(root, "src/scriptSchemaValidator.ts")],
  target: "browser",
  format: "iife",
  minify: true,
})
if (!result.success) throw new AggregateError(result.logs, "Schema validator bundle failed")
const source = await result.outputs[0]!.text()
const file = Bun.file(resolve(root, "src/scriptSchemaValidator.bundle.txt"))
if (process.argv.includes("--check")) {
  if (await file.text() !== source) throw Error("Schema validator bundle is stale; run bun scripts/build-schema-validator.ts")
} else await Bun.write(file, source)
