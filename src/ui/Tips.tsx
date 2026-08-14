import { useState } from "react"
import { useTheme } from "./theme"
import { CenterText } from "./CenterText"

const TIPS = [
  "send the request with {^↩} — works from any pane",
  "save the current request to disk with {^S}",
  "cycle environments with {^U}",
  "cycle focus between panes with {Tab} / {Shift+Tab}",
  "open the keybinding cheatsheet overlay with {F1}",
  "variables use $var syntax — defined in environment files",
  "use :name URL tokens and the Path tab for required path parameters",
  "enter request browse mode with {Enter} in the request pane",
  "edit a field — press {Enter} on any header, param, or body in browse mode",
  "toggle header or param on/off with {Space} in browse mode",
  "revert a field to its saved value with {^D}",
  "revert all fields to their saved values with {^R}",
  "edit request details with {^E}",
  "change the color theme with {^T}",
  "toggle layout between stacked and side-by-side with {^L}",
  "switch response tabs with {←}/{→} arrow keys",
  "scroll the response with {↑}/{↓} or {PgUp}/{PgDn}",
  "response body auto-formats JSON when detected",
  "open the Network response tab to follow requests, redirects, and responses",
  "create a new request with {^N}",
  "import OpenAPI, Swagger, Postman, or Insomnia files with {noodle import <path>}",
  "export a collection as OpenAPI or Postman with {noodle export <collection> --format <format> --output <path>}",
  "open {^P}, choose Import Collection to bring a source into a new or current collection",
  "open {^P}, choose Export Collection to preview and write OpenAPI or Postman output",
  "environment variables let you switch between dev, staging, prod",
  "clone a request with {^K}",
  "delete a request with {^W}",
  "right-click a request, folder, or environment for its context menu",
  "copy the response body with {^B}",
  "create a new folder with {^Alt+N}",
  "press {F2} to expand a pane fullscreen",
  "edit request YAML directly with {^Alt+E}",
  "JSON bodies use the code editor with folding and variable completion",
  "fold JSON response blocks with {^G}, or click a gutter marker",
  "undo or redo code editor changes with {^Z} / {^Shift+Z}",
  "jump to a visible pane or tab: press {g}, then its hint letter",
  "in the environment editor, press {g} then {v} to jump to variables",
  "find a request or folder with {^F}",
  "open {^P}, choose Generate Code to export request as client code",
  "open {^P} to fetch, copy, or clear the selected request's OAuth 2 token",
  "check for updates with {noodle update} or {^P} then Update Noodle",
  "press {e} to search environments; use {F3} to open the editor",
  "open Settings with {F4} to configure proxies, TLS, collections, and shortcuts",
  "open {^P}, choose Cookies to inspect and manage the collection cookie jar",
  "create an environment with {^N} in the environment editor",
  "mark an environment value secret with {s} in environment browse mode",
  "temporarily disable TLS verification with {noodle --insecure}",
  "recent responses are saved in a timeline per request",
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

  const [tip] = useState(
    () => TIPS[Math.floor(Math.random() * TIPS.length)] ?? TIPS[0],
  )
  const parts = parseTip(tip)
  const segments = [
    { text: "● Tip", color: theme.primary },
    ...parts.map((p) => ({
      text: p.text,
      color: p.isKey ? theme.text : theme.textMuted,
    })),
  ]

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
      <CenterText segments={segments} />
    </box>
  )
}
