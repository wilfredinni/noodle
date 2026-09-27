import {
  SCRIPT_API_CONTRACT,
  type ScriptApiDescriptor,
  type ScriptPhase,
} from "./preRequestScript"

// Supporting value shapes; callable names, signatures, and phase capabilities
// come exclusively from SCRIPT_API_CONTRACT (including random/time catalogs).
const values = `type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";
type Encoding = "hex" | "base64";
interface CookieInput { name: string; value: string; path?: string; expires?: string; secure?: boolean; httpOnly?: boolean; sameSite?: "strict" | "lax" | "none" }
interface DirectRequest { url: string; method?: Method; headers?: Record<string, string>; body?: string; timeout?: number }

`

export function generateScriptDeclarations(editorPhase?: ScriptPhase): string {
  // Editor-only JSON readers use any so ordinary property access needs no JSDoc
  // narrowing. Exported declarations keep their stricter JsonValue types.
  const members = (
    global: ScriptApiDescriptor["global"],
    parent: string,
    phase?: ScriptPhase,
  ): string => {
    const entries = SCRIPT_API_CONTRACT.filter(
      (entry) =>
        entry.global === global && (!phase || entry.phases.includes(phase)),
    )
    return entries
      .filter(
        (entry) =>
          entry.member &&
          entry.member.split(".").slice(0, -1).join(".") === parent,
      )
      .map((entry) => {
        const name = entry.member.split(".").at(-1)!
        const doc = `/** ${entry.description} @phases ${entry.phases.join(", ")} */`
        if (entry.kind === "method") {
          const signature =
            editorPhase &&
            entry.global === "noodle" &&
            ["request.body.json", "response.json", "run.get"].includes(
              entry.member,
            )
              ? entry.signature.replace(
                  /: JsonValue(?: \| undefined)?$/,
                  ": any",
                )
              : entry.signature
          return `${doc}\n${signature};`
        }
        const nested = members(global, entry.member, phase)
        const signature = entry.signature.replace(/^noodle\./, "")
        const hasMembers = SCRIPT_API_CONTRACT.some(
          (child) =>
            child.global === global &&
            child.member.startsWith(`${entry.member}.`),
        )
        let type =
          nested || hasMembers
            ? `{\n${nested}\n}`
            : signature.startsWith(`${name}:`)
              ? signature.slice(name.length + 1).trim()
              : signature
        if (editorPhase && entry.member === "iteration")
          type = type.replace(
            "data: object",
            "data: Readonly<Record<string, any>>",
          )
        const writable = phase
          ? entry.writableIn?.includes(phase)
          : !!entry.writableIn?.length
        return `${doc}\n${writable ? "" : "readonly "}${name}: ${type};`
      })
      .join("\n")
  }
  const globals = SCRIPT_API_CONTRACT.filter(
    (entry) =>
      entry.kind === "global" &&
      (!editorPhase || entry.phases.includes(editorPhase)) &&
      (entry.global === "test" || entry.global === "expect"),
  )
    .map(
      (entry) =>
        `/** ${entry.description} Tests phase only. */\ndeclare function ${entry.signature.replace(/\bMatchers\b/g, "NoodleScript.Matchers")};`,
    )
    .join("\n")
  const globalType = editorPhase
    ? editorPhase[0]!.toUpperCase() + editorPhase.slice(1)
    : "Api"
  return `// Generated from SCRIPT_API_CONTRACT. Run bun scripts/generate-script-api.ts.\n// The noodle global includes all phases; external editors cannot infer a file's execution phase.\n// Runtime phase checks remain authoritative. For phase-specific member checking, use a typed alias:\n// /** @type {NoodleScript.Post} */ const post = noodle;\n// Use NoodleScript.Pre or NoodleScript.Tests for other phases; test/expect globals are tests-only.\ndeclare namespace NoodleScript {\n${values}\ninterface ScriptResponse {\n${members("noodle", "response", "post")}\nreadonly execution?: JsonValue;\n}\ninterface Matchers {\n${members("expect", "")}\n}\ninterface Api {\n${members("noodle", "")}\n}\n${(["pre", "post", "tests"] as const).map((phase) => `interface ${phase[0]!.toUpperCase() + phase.slice(1)} {\n${members("noodle", "", phase)}\n}`).join("\n")}\n}\ndeclare const noodle: NoodleScript.${globalType};\ninterface Console {\n${members("console", "")}\n}\ndeclare var console: Console;\n${globals}\n`
}
