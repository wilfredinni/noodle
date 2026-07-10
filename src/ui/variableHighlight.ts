import { SyntaxStyle } from "@opentui/core"
import type { InputRenderable, TextareaRenderable } from "@opentui/core"
import type { Environment } from "../schema"
import type { Theme } from "./theme"
import { getVariableHighlights } from "./variableCompletion"

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

  for (const highlight of getVariableHighlights(value, env)) {
    input.addHighlightByCharRange({
      start: highlight.start,
      end: highlight.end,
      styleId: style.getStyleId(
        highlight.exists ? "env.resolved" : "env.missing",
      )!,
      priority: 2,
    })
  }
}
