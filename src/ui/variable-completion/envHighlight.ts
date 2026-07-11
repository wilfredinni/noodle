import type { Environment } from "../../schema"

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
    const exists = env !== null && Object.hasOwn(env.vars, varName)
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
