import { buildJavascriptHighlightRanges } from "./javascriptSyntax"
import type {
  Highlight,
  SimpleHighlight,
  SyntaxStyle,
  TreeSitterClient,
} from "@opentui/core"
import type { Theme } from "../theme-data"
import {
  getEnvStyleIds,
  createCodeEditorSyntaxStyle,
  styleIdForJsonToken,
} from "./codeEditorStyles"
import {
  buildExtraHighlightRanges,
  buildJsonHighlightRanges,
  buildTreeSitterHighlightRanges,
  buildYamlHighlightRanges,
  type EditorHighlightRange,
} from "./codeEditorHighlighting"
import type { JsonToken } from "./syntax"

interface HighlightHost {
  clear: () => void
  setStyle: (style: SyntaxStyle) => void
  applyRanges: (ranges: EditorHighlightRange[]) => void
}

export class CodeEditorHighlightRenderer {
  private _theme: Theme
  private _style: SyntaxStyle
  private _envResolvedStyleId = 0
  private _envMissingStyleId = 0
  private _extra?: (content: string) => Highlight[]
  private _content = ""
  private _filetype = ""
  private _treeSitterHighlights: SimpleHighlight[] = []

  constructor(
    theme: Theme,
    extra: ((content: string) => Highlight[]) | undefined,
    private readonly host: HighlightHost,
  ) {
    this._extra = extra
    this._theme = theme
    this._style = createCodeEditorSyntaxStyle(theme)
    this.updateEnvStyleIds()
  }

  get envResolvedStyleId(): number {
    return this._envResolvedStyleId
  }

  get envMissingStyleId(): number {
    return this._envMissingStyleId
  }

  get extra(): ((content: string) => Highlight[]) | undefined {
    return this._extra
  }

  setTheme(theme: Theme): void {
    this._theme = theme
    this._style = createCodeEditorSyntaxStyle(theme)
    this.updateEnvStyleIds()
  }

  setExtra(extra: ((content: string) => Highlight[]) | undefined): void {
    this._extra = extra
  }

  prepare(): void {
    this.host.setStyle(this._style)
  }

  jsonStyleId(token: JsonToken): number {
    return styleIdForJsonToken(token.kind, token.fg, this._theme, this._style)
  }

  clear(): void {
    this._content = ""
    this._treeSitterHighlights = []
    this.host.clear()
  }

  apply(content: string, filetype: string): void {
    if (content.length === 0 || content.length > 100_000) {
      this.clear()
      return
    }
    if (filetype !== this._filetype) this._treeSitterHighlights = []
    this.rebaseHighlights(content)
    this._filetype = filetype
    if (filetype === "json") this.applyJson(content)
    else if (filetype === "yaml") this.applyYaml(content)
    else if (filetype === "javascript") this.applyJavascript(content)
    else this.host.clear()
    this.host.setStyle(this._style)
    this.host.applyRanges(
      buildTreeSitterHighlightRanges(
        this._treeSitterHighlights,
        content,
        this._style,
      ),
    )
    this.applyExtra(content)
  }

  async highlight(
    content: string,
    filetype: string,
    client: TreeSitterClient,
    isCurrent: () => boolean,
  ): Promise<void> {
    let highlights: SimpleHighlight[] = []
    try {
      const result = await client.highlightOnce(content, filetype)
      highlights = result.highlights ?? []
    } catch {
      // Local highlighting covers unavailable parsers.
    }
    if (!isCurrent()) return
    this._content = content
    this._filetype = filetype
    this._treeSitterHighlights = highlights
    this.apply(content, filetype)
  }

  private rebaseHighlights(content: string): void {
    if (content === this._content) return
    if (this._treeSitterHighlights.length > 0) {
      // The worker returns JavaScript string offsets. Keep surviving tokens colored
      // while the debounced parser catches up with the edited buffer.
      const before = this._content
      const after = content
      let start = 0
      while (
        start < before.length &&
        start < after.length &&
        before[start] === after[start]
      )
        start++
      let oldEnd = before.length
      let newEnd = after.length
      while (
        oldEnd > start &&
        newEnd > start &&
        before[oldEnd - 1] === after[newEnd - 1]
      ) {
        oldEnd--
        newEnd--
      }
      const delta = newEnd - oldEnd
      this._treeSitterHighlights = this._treeSitterHighlights.flatMap(
        (highlight) => {
          const [from, to, group, meta] = highlight
          if (to <= start) return [highlight]
          if (from >= oldEnd)
            return [[from + delta, to + delta, group, meta] as SimpleHighlight]
          if (from < start && to > oldEnd)
            return [[from, to + delta, group, meta] as SimpleHighlight]
          return []
        },
      )
    }
    this._content = content
  }

  private applyJavascript(content: string): void {
    this.host.clear()
    this.host.setStyle(this._style)
    this.host.applyRanges(buildJavascriptHighlightRanges(content, this._style))
  }

  private applyJson(content: string): void {
    this.host.clear()
    this.host.setStyle(this._style)
    this.host.applyRanges(
      buildJsonHighlightRanges(content, this._theme, this._style),
    )
  }

  private applyYaml(content: string): void {
    this.host.clear()
    this.host.setStyle(this._style)
    this.host.applyRanges(
      buildYamlHighlightRanges(content, this._theme, this._style),
    )
  }

  private applyExtra(content: string): void {
    if (!this._extra) return
    try {
      this.host.applyRanges(
        buildExtraHighlightRanges(content, this._extra(content)),
      )
    } catch {
      // Extra highlighters may reject malformed source while editing.
    }
  }

  private updateEnvStyleIds(): void {
    const { resolved, missing } = getEnvStyleIds(this._style)
    this._envResolvedStyleId = resolved
    this._envMissingStyleId = missing
  }
}
