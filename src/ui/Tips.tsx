import { useState } from "react"
import { useTheme } from "./theme"
import { CenterText } from "./CenterText"

const TIPS = [
  "send the request with {^↩}: works from any pane",
  "save the current request to disk with {^S}",
  "cycle environments with {^U}",
  "cycle focus between panes with {Tab} / {Shift+Tab}",
  "open the keybinding cheatsheet overlay with {F1}",
  "variables use $var syntax: defined in environment files",
  "use :name URL tokens and the Path tab for required path parameters",
  "enter request browse mode with {Enter} in the request pane",
  "edit a field: press {Enter} on any header, param, or body in browse mode",
  "toggle header or param on/off with {Space} in browse mode",
  "delete a header, param, assertion, or capture row with {^D} in request browse mode",
  "edit assertions in {Assert}, captures in {Capture}, and tags in {Settings}",
  "reveal empty {Assert} or {Capture} tabs from the request pane's {+} menu",
  "press {g} then {o} to focus the request pane's {+} menu",
  "response {Results} shows {✓}/{✗}/{–} for passed, failed, or unevaluated outcomes",
  "author {scripts.pre} and {scripts.post} in request YAML; inspect both phases in response {Results}",
  "script APIs use the {noodle.} prefix: {noodle.request}, {noodle.response}, and {noodle.run}",
  "use {noodle.random.seed} for repeatable test data; share generated values with {noodle.run.set}",
  "manual sends can save script values with {noodle.run.set} persistence; collection runs keep them transient",
  "revert all fields with {^R} in request or folder browse mode",
  "edit request details with {^E}",
  "change the color theme with {^T}",
  "choose {system} in the theme picker to follow your terminal's colors",
  "toggle layout between stacked and side-by-side with {^L}",
  "drag pane dividers to resize; double-click a divider to reset it",
  "switch tabs with {←}/{→} when the response pane is focused",
  "scroll with {↑}/{↓} or {PgUp}/{PgDn} when the response body is focused",
  "response body auto-formats JSON when detected",
  "press {m} in the response Body tab to switch between Source and Visual",
  "press {/} in Visual to search response labels and values; {Esc} clears the filter",
  "expand Visual response rows with {Enter}, {Space}, or a click",
  "save a live binary response with {^Alt+S} in its Body tab; {^Alt+O} opens it after saving",
  "hide or show the sidebar with {^B}; {g} then {s} reopens and focuses it",
  "open the Network response tab to follow requests, redirects, and responses",
  "create a new request with {^N}",
  "import OpenAPI, Swagger, Postman, or Insomnia files with {noodle import <path>}",
  "export a collection as OpenAPI or Postman with {noodle export <collection> --format <format> --output <path>}",
  "run a tagged collection suite with {noodle collection run <path> --tag smoke}",
  "download original response bytes to a new file with {noodle request run <id> --collection <path> --output <file>}",
  "open the collection Runner with {F5} to select requests, filters, and an optional delay",
  "open {^P}, choose Import Collection to bring a source into a new or current collection",
  "open {^P}, choose Export Collection to preview and write OpenAPI or Postman output",
  "clone a request with {^K}",
  "delete a request with {^W}",
  "right-click a request, folder, or environment for its context menu",
  "copy the text response body with {^Alt+B}",
  "create a new folder with {^Alt+N}",
  "press {F2} to expand a pane fullscreen",
  "edit request YAML directly with {^Alt+E}",
  "JSON and XML bodies use the code editor with syntax highlighting and variable completion",
  "fold JSON response blocks with {^G}, or click a gutter marker",
  "undo or redo code editor changes with {^Z} / {^Shift+Z}",
  "jump to a visible pane or tab: press {g}, then its hint letter",
  "in the environment editor, press {g} then {v} to jump to variables",
  "find a request or folder with {^F}",
  "open {^P}, choose Generate Code to export request as client code",
  "open {^P} to fetch, copy, or clear the selected request's OAuth 2 token",
  "set an OAuth 2 {Discovery URL} to fill missing endpoints; choose {document} for an exact URL",
  "check for updates with {noodle update} or {^P} then About and Updates",
  "press {e} to search environments; use {F3} to open the editor",
  "open Settings with {F4} to configure proxies, TLS, collections, and shortcuts",
  "open {^P}, choose Cookies to inspect and manage the collection cookie jar",
  "open {^P} to launch the collection or Noodle settings in your external editor",
  "open {^P}, choose Install Noodle skill to equip supported coding agents",
  "fix invalid request or folder YAML in the repair view, then save with {^S}",
  "create an environment with {^N} in the environment editor",
  "mark an environment value secret with {s} in environment browse mode",
  "temporarily disable TLS verification with {noodle --insecure}",
  "manual sends save timeline history with known secrets redacted at save time",
  "timeline details retain redacted pre/post diagnostics and logs; script source stays in request YAML",
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
