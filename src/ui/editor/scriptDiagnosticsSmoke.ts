import { createScriptDiagnostics } from "./scriptDiagnostics"

export async function verifyBundledScriptDiagnostics() {
  const checker = createScriptDiagnostics()
  try {
    const invalid = await checker.check(
      'noodle.request.headers.set(42, "x")',
      "pre",
    )
    if (!invalid.first?.message.includes("not assignable"))
      throw new Error(JSON.stringify(invalid))
    const valid = await checker.check(
      'const child = await noodle.runRequest("child"); console.log(child.json().id)',
      "pre",
    )
    if (valid.count) throw new Error(JSON.stringify(valid))
    const source = "noodle.random."
    const context = { environmentKeys: [], requestIds: [] }
    const completion = await checker.assist(
      source,
      "pre",
      source.length,
      context,
    )
    if (!completion.items.some((item) => item.label === "email"))
      throw new Error("Missing bundled completion")
    const call = 'noodle.run.set("key", '
    const help = await checker.assist(call, "pre", call.length, context)
    if (help.signatureHelp?.activeParameter !== 1)
      throw new Error("Missing bundled parameter help")
  } finally {
    checker.dispose()
  }
}
