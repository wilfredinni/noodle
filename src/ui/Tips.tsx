import { useTheme } from "./theme"

const TIPS = [
  "send the request with {^↩} — works from any pane",
  "save the current request to disk with {^S}",
  "cycle environments with {^.}",
  "cycle focus between panes with {Tab} / {Shift+Tab}",
  "open the keybinding cheatsheet overlay with {F1}",
  "variables use $var syntax — defined in environment files",
  "enter request browse mode with {Enter} in the request pane",
  "edit a field — press {Enter} on any header, param, or body in browse mode",
  "toggle header or param on/off with {^X} in browse mode",
  "revert a field to its saved value with {^D}",
  "revert all fields to their saved values with {^R}",
  "edit request YAML directly with {^E}",
  "change the color theme with {^T}",
  "toggle layout between stacked and side-by-side with {^L}",
  "switch response tabs with {←}/{→} arrow keys",
  "scroll the response with {↑}/{↓} or {PgUp}/{PgDn}",
  "response body auto-formats JSON when detected",
  "create a new request — save with {^S} and type a new name",
  "import an OpenAPI spec with {bun run import <path>}",
  "environment variables let you switch between dev, staging, prod",
]

interface TipPart {
  text: string
  isKey: boolean
}

export function parseTip(tip: string): TipPart[] {
  const parts: TipPart[] = []
  const re = /\{\{(.+?)\}\}|\{(.+?)\}/g
  let lastEnd = 0
  let match: RegExpExecArray | null
  while ((match = re.exec(tip)) !== null) {
    if (match.index > lastEnd) {
      parts.push({ text: tip.slice(lastEnd, match.index), isKey: false })
    }
    if (match[1] !== undefined) {
      parts.push({ text: `{{${match[1]}}}`, isKey: false })
    } else {
      parts.push({ text: match[2]!, isKey: true })
    }
    lastEnd = match.index + match[0].length
  }
  if (lastEnd < tip.length) {
    parts.push({ text: tip.slice(lastEnd), isKey: false })
  }
  return parts
}

export function Tips() {
  const theme = useTheme()

  const tip = TIPS[Math.floor(Math.random() * TIPS.length)] ?? TIPS[0]
  const parts = parseTip(tip)

  return (
    <box
      style={{
        flexGrow: 1,
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        paddingLeft: 4,
        paddingRight: 4,
      }}
    >
      <box
        style={{
          flexDirection: "row",
          gap: 0,
          flexShrink: 0,
        }}
      >
        <text fg={theme.secondary}>● Tip </text>
        {parts.map((part, i) => (
          <text key={i} fg={part.isKey ? theme.primary : theme.textMuted}>
            {part.text}
          </text>
        ))}
      </box>
    </box>
  )
}
