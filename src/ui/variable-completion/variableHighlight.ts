import type { Environment, ParamEntry } from "../../schema"
import { SyntaxStyle } from "@opentui/core"
import type { InputRenderable, TextareaRenderable } from "@opentui/core"
import type { Theme } from "../theme-data"
import { getVariableHighlights } from "./variableCompletion"
import {
  buildCharToDisplayOffsets,
  charOffsetToDisplayOffset,
} from "./highlightOffsets"

export function highlightVariables(
  input: InputRenderable | TextareaRenderable,
  value: string,
  theme: Theme,
  env: Environment | null,
  pathParams?: ParamEntry[],
): void {
  const style = SyntaxStyle.fromStyles({
    "env.resolved": { fg: theme.primary },
    "env.missing": { fg: theme.error },
    "path.resolved": { fg: theme.primary },
    "path.missing": { fg: theme.error },
  })
  input.clearAllHighlights()
  input.syntaxStyle = style
  const displayOffsets = buildCharToDisplayOffsets(value)

  for (const highlight of getVariableHighlights(value, env)) {
    input.addHighlightByCharRange({
      start: charOffsetToDisplayOffset(displayOffsets, highlight.start),
      end: charOffsetToDisplayOffset(displayOffsets, highlight.end),
      styleId: style.getStyleId(
        highlight.exists ? "env.resolved" : "env.missing",
      )!,
      priority: 2,
    })
  }

  const pathEntryResolved = (name: string): boolean => {
    if (!pathParams) return false
    const entry = pathParams.find((p) => p.name === name)
    return entry !== undefined && entry.enabled && entry.value !== ""
  }

  for (const m of value.matchAll(/(?:^|\/):(\w[\w-]*)/g)) {
    const name = m[1]!
    const resolved = pathEntryResolved(name)
    const colonIdx = m.index + (m[0][0] === "/" ? 1 : 0)
    input.addHighlightByCharRange({
      start: charOffsetToDisplayOffset(displayOffsets, colonIdx),
      end: charOffsetToDisplayOffset(displayOffsets, m.index + m[0].length),
      styleId: style.getStyleId(resolved ? "path.resolved" : "path.missing")!,
      priority: 2,
    })
  }
}
