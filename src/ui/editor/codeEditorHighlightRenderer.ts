import type {
  Highlight,
  SimpleHighlight,
  SyntaxStyle,
  TreeSitterClient,
} from "@opentui/core"
import type { Theme } from "../theme-data"
import { getEnvStyleIds, createCodeEditorSyntaxStyle } from "./codeEditorStyles"
import {
  buildExtraHighlightRanges,
  buildJsonHighlightRanges,
  buildTreeSitterHighlightRanges,
  buildYamlHighlightRanges,
  type EditorHighlightRange,
} from "./codeEditorHighlighting"

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

  clear(): void {
    this.host.clear()
  }

  apply(content: string, filetype: string): void {
    if (content.length === 0) {
      this.host.clear()
      return
    }
    if (filetype === "json") this.applyJson(content)
    else if (filetype === "yaml") this.applyYaml(content)
    else this.host.clear()
    this.applyExtra(content)
  }

  async highlight(
    content: string,
    filetype: string,
    client: TreeSitterClient,
    isCurrent: () => boolean,
  ): Promise<void> {
    let succeeded = false
    try {
      const result = await client.highlightOnce(content, filetype)
      if (!isCurrent()) return
      if (result.highlights?.length) {
        this.applyTreeSitter(result.highlights, content)
        succeeded = true
      }
    } catch {
      // Local YAML highlighting covers unavailable parsers.
    }
    if (!isCurrent()) return
    if (!succeeded) {
      this.host.clear()
      if (filetype === "json") this.applyJson(content)
      if (filetype === "yaml") this.applyYaml(content)
    }
    this.applyExtra(content)
  }

  private applyTreeSitter(
    highlights: SimpleHighlight[],
    content: string,
  ): void {
    this.host.clear()
    this.host.setStyle(this._style)
    this.host.applyRanges(
      buildTreeSitterHighlightRanges(highlights, content, this._style),
    )
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
