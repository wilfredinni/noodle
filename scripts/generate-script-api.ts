import {
  generateScriptDeclarations,
  generateScriptReference,
} from "../src/scriptApiTypes"

for (const [path, expected] of [
  ["noodle-script.d.ts", generateScriptDeclarations()],
  ["reference/script-api.md", generateScriptReference()],
] as const) {
  const file = Bun.file(
    new URL(`../.agents/skills/noodle-use/${path}`, import.meta.url),
  )
  if (Bun.argv.includes("--check")) {
    if (!(await file.exists()) || (await file.text()) !== expected)
      throw new Error(`${path} is stale; run bun run script:generate`)
  } else if (!(await file.exists()) || (await file.text()) !== expected) {
    await Bun.write(file, expected)
  }
}
