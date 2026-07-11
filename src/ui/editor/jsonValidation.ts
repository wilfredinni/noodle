import type { Environment } from "../../schema"

const VAR_RE = /\$(\w+)/

/**
 * Validates the JSON that will actually be sent after Noodle's textual
 * environment-variable substitution. Values are deliberately not coerced or
 * quoted here; this mirrors requests/substitute.ts exactly.
 */
export function validateJsonContent(
  content: string,
  env: Environment | null,
): string | null {
  if (content.trim() === "") return null

  let substituted = content
  if (env !== null) {
    try {
      substituted = content.replace(VAR_RE, (match, name: string) => {
        if (!Object.hasOwn(env.vars, name)) {
          throw new Error(`unresolved variable "${name}"`)
        }
        return env.vars[name]!
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return `Invalid JSON: ${message}`
    }
  }

  try {
    JSON.parse(substituted)
    return null
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return `Invalid JSON: ${message}`
  }
}
