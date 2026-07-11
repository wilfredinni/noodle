import { SyntaxStyle } from "@opentui/core"
import type { InputRenderable, TextareaRenderable } from "@opentui/core"
import type { Environment } from "../../schema"
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
): void {
  const style = SyntaxStyle.fromStyles({
    "env.resolved": { fg: theme.primary },
    "env.missing": { fg: theme.error },
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
}
