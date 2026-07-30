import type { Environment, ParamEntry } from "../../schema"
import { URL_PATH_TOKEN_RE } from "../../requests/pathParams"

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

export interface PathAwareSegment {
  text: string
  isVar: boolean
  exists: boolean
  isPath: boolean
}

function pathEntryResolved(name: string, pathParams: ParamEntry[]): boolean {
  const entry = pathParams.find((p) => p.name === name)
  return entry !== undefined && entry.enabled && entry.value !== ""
}

export function splitUrlPathVars(
  text: string,
  env: Environment | null,
  pathParams: ParamEntry[],
): PathAwareSegment[] {
  const varSegments = splitEnvVars(text, env)
  const result: PathAwareSegment[] = []

  for (const seg of varSegments) {
    if (seg.isVar) {
      result.push({ ...seg, isPath: false })
      continue
    }
    const remaining = seg.text
    let lastEnd = 0
    URL_PATH_TOKEN_RE.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = URL_PATH_TOKEN_RE.exec(remaining)) !== null) {
      const colonIdx = match.index + (match[0]![0] === "/" ? 1 : 0)
      if (colonIdx > lastEnd) {
        result.push({
          text: remaining.slice(lastEnd, colonIdx),
          isVar: false,
          exists: false,
          isPath: false,
        })
      }
      const name = match[1]!
      const resolved = pathEntryResolved(name, pathParams)
      result.push({
        text: ":" + name,
        isVar: false,
        exists: resolved,
        isPath: true,
      })
      lastEnd = match.index + match[0].length
    }
    if (lastEnd < remaining.length) {
      result.push({
        text: remaining.slice(lastEnd),
        isVar: false,
        exists: false,
        isPath: false,
      })
    }
  }

  return result
}
