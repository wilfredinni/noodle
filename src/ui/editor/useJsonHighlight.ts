import { SyntaxStyle } from "@opentui/core"
import type { Theme } from "../theme-data"

export function createJsonSyntaxStyle(theme: Theme): SyntaxStyle {
  return SyntaxStyle.fromStyles({
    "json.key": { fg: theme.secondary },
    "json.string": { fg: theme.success },
    "json.number": { fg: theme.warning },
    "json.boolean": { fg: theme.info },
    "json.null": { fg: theme.info },
    "json.bracket": { fg: theme.textMuted },
    "json.text": { fg: theme.text },
    "env.resolved": { fg: theme.primary },
    "env.missing": { fg: theme.error },
  })
}
