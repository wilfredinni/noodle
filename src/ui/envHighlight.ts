import type { Environment } from "../schema"

const VAR_RE = /\$(\w+)/g

export interface EnvSegment {
  text: string
  isVar: boolean
  exists: boolean
}

export function splitEnvVars(
  text: string,
  env: Environment | null,
): EnvSegment[] {
  VAR_RE.lastIndex = 0
  const segments: EnvSegment[] = []
  let lastEnd = 0
  let match: RegExpExecArray | null
  while ((match = VAR_RE.exec(text)) !== null) {
    if (match.index > lastEnd) {
      segments.push({
        text: text.slice(lastEnd, match.index),
        isVar: false,
        exists: false,
      })
    }
    const varName = match[1]!
    const exists = env !== null && varName in env.vars
    segments.push({ text: match[0], isVar: true, exists })
    lastEnd = match.index + match[0].length
  }
  if (lastEnd < text.length) {
    segments.push({
      text: text.slice(lastEnd),
      isVar: false,
      exists: false,
    })
  }
  return segments
}

export function envVarStatus(
  value: string,
  env: Environment | null,
): "none" | "missing" | "resolved" {
  VAR_RE.lastIndex = 0
  if (!VAR_RE.test(value)) return "none"
  if (env === null) return "missing"
  VAR_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = VAR_RE.exec(value)) !== null) {
    if (!(match[1]! in env.vars)) return "missing"
  }
  return "resolved"
}

export function varSummaryColor(
  value: string,
  env: Environment | null,
  theme: { primary: string; error: string },
  baseColor: string,
): string {
  const status = envVarStatus(value, env)
  if (status === "none") return baseColor
  if (status === "missing") return theme.error
  return theme.primary
}
