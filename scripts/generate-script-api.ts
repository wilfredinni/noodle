import { generateScriptDeclarations } from "../src/scriptApiTypes"

const file = Bun.file(
  new URL("../.agents/skills/noodle-use/noodle-script.d.ts", import.meta.url),
)
const expected = generateScriptDeclarations()
if (Bun.argv.includes("--check")) {
  if (!(await file.exists()) || (await file.text()) !== expected)
    throw new Error(
      "noodle-script.d.ts is stale; run bun scripts/generate-script-api.ts",
    )
} else {
  await Bun.write(file, expected)
}
