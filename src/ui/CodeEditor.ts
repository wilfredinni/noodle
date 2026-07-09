import type { KeyEvent, PasteEvent } from "@opentui/core"
import {
  SyntaxStyle,
  parseColor,
  TextareaRenderable,
  getTreeSitterClient,
} from "@opentui/core"
import type { RenderContext, Highlight, LineInfo } from "@opentui/core"
import type { OptimizedBuffer } from "@opentui/core"
import type { SimpleHighlight } from "@opentui/core"
import type { TreeSitterClient } from "@opentui/core"
import type { Theme } from "./theme-data"
import { highlightJsonTokens } from "./syntax"
import { tokenizeYamlLine } from "./yamlSyntax"

export interface FoldInfo {
  startLine: number
  endLine: number
  startOffset: number
  endOffset: number
  summary: string
  folded: boolean
  extmarkId?: number
}

export interface CodeEditorOptions {
  filetype: string
  theme: Theme
  debounceMs?: number
  foldable?: boolean
  initialValue?: string
  extraHighlights?: (content: string) => Highlight[]
  onContentChange?: () => void
  onFoldsChange?: () => void
  backgroundColor?: string
  textColor?: string
  focusedBackgroundColor?: string
  focusedTextColor?: string
  cursorColor?: string
}

const FOLD_TYPE_NAME = "code-editor-fold"

let _foldTypeIdRegistered = false
let _sharedFoldTypeId = 0

function getFoldTypeId(): number {
  return _sharedFoldTypeId
}

function setFoldTypeId(id: number): void {
  _sharedFoldTypeId = id
  _foldTypeIdRegistered = true
}

function isFoldTypeRegistered(): boolean {
  return _foldTypeIdRegistered
}

function createTsSyntaxStyle(theme: Theme): SyntaxStyle {
  return SyntaxStyle.fromStyles({
    string: { fg: theme.success },
    number: { fg: theme.warning },
    boolean: { fg: theme.info },
    constant: { fg: theme.info },
    property: { fg: theme.secondary },
    comment: { fg: theme.textMuted },
    punctuation: { fg: theme.textMuted },
    keyword: { fg: theme.info },
    label: { fg: theme.info },
    type: { fg: theme.info },
    "env.resolved": { fg: theme.primary },
    "env.missing": { fg: theme.error },
  })
}

export class CodeEditorRenderable extends TextareaRenderable {
  private _filetype: string
  private _theme: Theme
  private _debounceMs: number
  private _foldable: boolean
  private _folds: Map<number, FoldInfo> = new Map()
  private _highlightTimer: ReturnType<typeof setTimeout> | null = null
  private _extraHighlights?: (content: string) => Highlight[]
  private _highlightSnapshotId: number = 0
  private _foldVisualRows: Map<number, number[]> = new Map()
  private _onContentChange?: () => void
  private _onFoldsChange?: () => void
  private _envResolvedStyleId: number = 0
  private _envMissingStyleId: number = 0
  private _tsClient: TreeSitterClient
  private _tsStyle: SyntaxStyle
  private _lastTsError: boolean = false

  constructor(ctx: RenderContext, options: CodeEditorOptions) {
    super(ctx, {
      initialValue: options.initialValue,
      backgroundColor: options.backgroundColor ?? "transparent",
      textColor: options.textColor ?? "#FFFFFF",
      focusedBackgroundColor: options.focusedBackgroundColor ?? "transparent",
      focusedTextColor: options.focusedTextColor ?? "#FFFFFF",
      cursorColor: options.cursorColor ?? "#FFFFFF",
    })

    this._filetype = options.filetype
    this._theme = options.theme
    this._debounceMs = options.debounceMs ?? 200
    this._foldable = options.foldable ?? true
    this._extraHighlights = options.extraHighlights
    this._onContentChange = options.onContentChange
    this._onFoldsChange = options.onFoldsChange
    this._tsClient = getTreeSitterClient()
    this._tsStyle = createTsSyntaxStyle(this._theme)
    this._envResolvedStyleId = this._tsStyle.getStyleId("env.resolved") ?? 0
    this._envMissingStyleId = this._tsStyle.getStyleId("env.missing") ?? 0

    const extmarks = this.editorView.extmarks
    if (extmarks && !isFoldTypeRegistered()) {
      setFoldTypeId(extmarks.registerType(FOLD_TYPE_NAME))
    }

    this.editBuffer.on("content-changed", () => {
      if (!this.isDestroyed) {
        this.scheduleHighlight()
        this._foldVisualRows.clear()
        this._onContentChange?.()
      }
    })

    if (this.plainText.length > 0) {
      const content = this.plainText
      if (this._filetype === "json") {
        this.applyJsonHighlights(content)
      } else if (this._filetype === "yaml") {
        this.applyYamlHighlights(content)
      }
      this.scheduleHighlight()
    }
  }

  get filetype(): string {
    return this._filetype
  }

  set filetype(value: string) {
    if (this._filetype !== value) {
      this._filetype = value
      this.clearAllHighlights()
      this._tsStyle = createTsSyntaxStyle(this._theme)
      this._envResolvedStyleId = this._tsStyle.getStyleId("env.resolved") ?? 0
      this._envMissingStyleId = this._tsStyle.getStyleId("env.missing") ?? 0
      this.scheduleHighlight()
      this.computeFoldRanges()
    }
  }

  get extraHighlights(): ((content: string) => Highlight[]) | undefined {
    return this._extraHighlights
  }

  set extraHighlights(value: ((content: string) => Highlight[]) | undefined) {
    this._extraHighlights = value
    this.scheduleHighlight()
  }

  get foldable(): boolean {
    return this._foldable
  }

  set foldable(value: boolean) {
    this._foldable = value
    this._folds.clear()
    this._foldVisualRows.clear()
    this.requestRender()
  }

  getFolds(): Map<number, FoldInfo> {
    return new Map(this._folds)
  }

  getFoldSigns(): Map<number, { before: string; beforeColor: string }> {
    const signs = new Map<number, { before: string; beforeColor: string }>()
    for (const [line, fold] of this._folds) {
      signs.set(line, {
        before: fold.folded ? "▶" : "▼",
        beforeColor: "#888888",
      })
    }
    return signs
  }

  set theme(value: Theme) {
    this._theme = value
    this._tsStyle = createTsSyntaxStyle(this._theme)
    this._envResolvedStyleId = this._tsStyle.getStyleId("env.resolved") ?? 0
    this._envMissingStyleId = this._tsStyle.getStyleId("env.missing") ?? 0
    this.scheduleHighlight()
  }

  get envResolvedStyleId(): number {
    return this._envResolvedStyleId
  }

  get envMissingStyleId(): number {
    return this._envMissingStyleId
  }

  toggleFold(line: number): void {
    const fold = this._folds.get(line)
    if (!fold) return

    if (fold.folded) {
      this.unfold(fold)
    } else {
      this.fold(fold)
    }
    this.requestRender()
  }

  private fold(fold: FoldInfo): void {
    const extmarks = this.editorView.extmarks
    if (!extmarks) return

    const extmarkId = extmarks.create({
      start: fold.startOffset,
      end: fold.endOffset,
      virtual: true,
      priority: 10,
      typeId: getFoldTypeId(),
      metadata: { foldStartLine: fold.startLine },
    })

    fold.folded = true
    fold.extmarkId = extmarkId
    this._folds.set(fold.startLine, fold)
    this._foldVisualRows.clear()
    this._onFoldsChange?.()
  }

  private unfold(fold: FoldInfo): void {
    const extmarks = this.editorView.extmarks
    if (!extmarks) return

    if (fold.extmarkId !== undefined) {
      extmarks.delete(fold.extmarkId)
    }

    fold.folded = false
    fold.extmarkId = undefined
    this._folds.set(fold.startLine, fold)
    this._foldVisualRows.clear()
    this._onFoldsChange?.()
  }

  foldAll(): void {
    for (const fold of this._folds.values()) {
      if (!fold.folded) this.fold(fold)
    }
    this.requestRender()
  }

  unfoldAll(): void {
    for (const fold of this._folds.values()) {
      if (fold.folded) this.unfold(fold)
    }
    this.requestRender()
  }

  override handlePaste(event: PasteEvent): void {
    super.handlePaste(event)
    this.scheduleHighlight()
  }

  override handleKeyPress(key: KeyEvent): boolean {
    if (key.ctrl && !key.meta && !key.alt && !key.super && !key.hyper) {
      if (key.name === "g" && !key.shift) {
        this.toggleFold(this.logicalCursor.row)
        return true
      }
    }

    if (key.ctrl && key.shift && !key.meta && !key.alt && !key.super && !key.hyper) {
      if (key.name === "[") {
        this.foldAll()
        return true
      }
      if (key.name === "]") {
        this.unfoldAll()
        return true
      }
    }

    const handled = super.handleKeyPress(key)
    if (handled) {
      this.scheduleHighlight()
    }
    return handled
  }

  protected override renderSelf(buffer: OptimizedBuffer): void {
    super.renderSelf(buffer)

    if (this._foldable) {
      this.renderFoldOverlays(buffer)
    }
  }

  private renderFoldOverlays(buffer: OptimizedBuffer): void {
    const screenX = this._screenX
    const screenY = this._screenY
    const lineInfo = this.lineInfo

    for (const fold of this._folds.values()) {
      if (!fold.folded) continue

      const visualRows = this.getVisualRowsForFold(fold, lineInfo)
      if (visualRows.length <= 1) continue

      for (let i = 1; i < visualRows.length; i++) {
        const visualRow = visualRows[i]
        if (visualRow < 0 || visualRow >= this.height) continue
        buffer.fillRect(
          screenX,
          screenY + visualRow,
          this.width,
          1,
          parseColor("transparent"),
        )
      }

      const firstVisualRow = visualRows[0]
      const visibleRowY = screenY + firstVisualRow
      if (visibleRowY >= screenY && visibleRowY < screenY + this.height) {
        buffer.drawText(
          `▶ ${fold.summary}`,
          screenX,
          visibleRowY,
          parseColor("#888888"),
          parseColor("transparent"),
        )
      }
    }
  }

  private getVisualRowsForFold(fold: FoldInfo, lineInfo: LineInfo): number[] {
    const cacheKey = fold.startLine
    const cached = this._foldVisualRows.get(cacheKey)
    if (cached) return cached

    if (!lineInfo || !lineInfo.lineSources) return []

    const sources = lineInfo.lineSources
    const rows: number[] = []
    for (let i = 0; i < sources.length; i++) {
      if (sources[i] >= fold.startLine && sources[i] <= fold.endLine) {
        rows.push(i)
      }
    }

    this._foldVisualRows.set(cacheKey, rows)
    return rows
  }

  protected override onResize(width: number, height: number): void {
    super.onResize(width, height)
    this._foldVisualRows.clear()
  }

  override destroy(): void {
    if (this._highlightTimer) {
      clearTimeout(this._highlightTimer)
      this._highlightTimer = null
    }

    const extmarks = this.editorView.extmarks
    if (extmarks) {
      for (const fold of this._folds.values()) {
        if (fold.extmarkId !== undefined) {
          extmarks.delete(fold.extmarkId)
        }
      }
    }

    this._folds.clear()
    this._foldVisualRows.clear()

    super.destroy()
  }

  private scheduleHighlight(): void {
    if (this._highlightTimer) {
      clearTimeout(this._highlightTimer)
    }
    this._highlightTimer = setTimeout(() => {
      this._highlightTimer = null
      this.highlight()
    }, this._debounceMs)
  }

  private async highlight(): Promise<void> {
    const snapshotId = ++this._highlightSnapshotId
    const content = this.plainText

    if (content.length === 0 || content.length > 100_000) return

    let tsSuccess = false

    try {
      const result = await this._tsClient.highlightOnce(content, this._filetype)

      if (snapshotId !== this._highlightSnapshotId) return
      if (this.isDestroyed) return

      const highlights = result.highlights
      if (highlights && highlights.length > 0) {
        this.applyTsHighlights(highlights, content)
        tsSuccess = true
        this._lastTsError = false
      }
    } catch {
      this._lastTsError = true
    }

    if (snapshotId !== this._highlightSnapshotId) return
    if (this.isDestroyed) return

    if (!tsSuccess) {
      if (this._filetype === "json") {
        this.applyJsonHighlights(content)
      } else if (this._filetype === "yaml") {
        this.applyYamlHighlights(content)
      }
    }

    try {
      this.applyExtraHighlights(content)
    } catch {
      // extraHighlights callback may throw on malformed content
    }
    this.computeFoldRanges()
  }

  private applyTsHighlights(
    highlights: SimpleHighlight[],
    content: string,
  ): void {
    this.clearAllHighlights()

    const style = this._tsStyle
    this.syntaxStyle = style

    const newlinesAt: number[] = []
    for (let i = 0; i < content.length; i++) {
      if (content[i] === "\n") newlinesAt.push(i)
    }

    for (const [start, end, group] of highlights) {
      if (start >= end) continue
      const styleId = style.getStyleId(group)
      if (styleId === null) continue

      let displayStart = start
      let displayEnd = end
      if (newlinesAt.length > 0) {
        displayStart = start - countNewlinesBefore(newlinesAt, start)
        displayEnd = end - countNewlinesBefore(newlinesAt, end)
      }

      this.addHighlightByCharRange({
        start: displayStart,
        end: displayEnd,
        styleId,
        priority: 1,
      })
    }
  }

  private applyJsonHighlights(content: string): void {
    this.clearAllHighlights()

    const tokens = highlightJsonTokens(content, this._theme)
    const style = this._tsStyle
    this.syntaxStyle = style

    for (const token of tokens) {
      let styleName: string
      if (token.fg === this._theme.secondary) styleName = "property"
      else if (token.fg === this._theme.success) styleName = "string"
      else if (token.fg === this._theme.warning) styleName = "number"
      else if (token.fg === this._theme.info) styleName = "boolean"
      else if (token.fg === this._theme.textMuted) styleName = "punctuation"
      else styleName = "string"

      const styleId = style.getStyleId(styleName) ?? 0
      this.addHighlightByCharRange({
        start: token.offset,
        end: token.offset + token.text.length,
        styleId,
        priority: 1,
      })
    }
  }

  private applyYamlHighlights(content: string): void {
    this.clearAllHighlights()

    const style = this._tsStyle

    this.syntaxStyle = style

    let offset = 0
    const lines = content.split("\n")

    for (const line of lines) {
      const spans = tokenizeYamlLine(line, this._theme)
      for (const span of spans) {
        if (span.text.length > 0) {
          let tsName = "string"
          if (span.fg === this._theme.secondary) tsName = "property"
          else if (span.fg === this._theme.success) tsName = "string"
          else if (span.fg === this._theme.warning) tsName = "number"
          else if (span.fg === this._theme.info) tsName = "boolean"
          else if (span.fg === this._theme.textMuted) tsName = "comment"
          const styleId = style.getStyleId(tsName) ?? 0
          this.addHighlightByCharRange({
            start: offset,
            end: offset + span.text.length,
            styleId,
            priority: 1,
          })
          offset += span.text.length
        }
      }
    }
  }

  private applyExtraHighlights(content: string): void {
    if (!this._extraHighlights) return

    const extras = this._extraHighlights(content)
    for (const hl of extras) {
      this.addHighlightByCharRange({
        start: hl.start,
        end: hl.end,
        styleId: hl.styleId,
        priority: hl.priority ?? 2,
      })
    }
  }

  private computeFoldRanges(): void {
    if (!this._foldable) return

    const content = this.plainText
    const newFolds = new Map<number, FoldInfo>()

    if (this._filetype === "json") {
      this.computeJsonFoldRanges(content, newFolds)
    } else if (this._filetype === "yaml") {
      this.computeYamlFoldRanges(content, newFolds)
    }

    const prevFolds = this._folds
    this._folds = newFolds

    for (const [line, fold] of prevFolds) {
      if (fold.folded && !newFolds.has(line)) {
        this.unfold(fold)
      }
    }
    this._onFoldsChange?.()
  }

  private computeJsonFoldRanges(
    content: string,
    folds: Map<number, FoldInfo>,
  ): void {
    const lines = content.split("\n")
    const stack: {
      char: string
      line: number
      offset: number
    }[] = []

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      for (let j = 0; j < line.length; j++) {
        const ch = line[j]
        if (ch === '"') {
          j++
          while (j < line.length) {
            if (line[j] === "\\") {
              j++
            } else if (line[j] === '"') break
            j++
          }
          continue
        }
        if (ch === "{" || ch === "[") {
          stack.push({
            char: ch,
            line: i,
            offset: this.lineAndColToOffset(i, j, lines),
          })
        } else if (ch === "}" || ch === "]") {
          const expected = ch === "}" ? "{" : "["
          for (let k = stack.length - 1; k >= 0; k--) {
            if (stack[k].char === expected) {
              const startLine = stack[k].line
              if (startLine < i) {
                const summary = this.getJsonFoldSummary(lines, startLine, i)
                folds.set(startLine, {
                  startLine,
                  endLine: i,
                  startOffset: stack[k].offset,
                  endOffset: this.lineAndColToOffset(i, j, lines),
                  summary,
                  folded: this._folds.get(startLine)?.folded ?? false,
                })
              }
              stack.length = k
              break
            }
          }
        }
      }
    }
  }

  private computeYamlFoldRanges(
    content: string,
    folds: Map<number, FoldInfo>,
  ): void {
    const lines = content.split("\n")

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (line.trim() === "" || line.trim().startsWith("#")) continue

      const indent = line.length - line.trimStart().length
      let endLine = i

      for (let j = i + 1; j < lines.length; j++) {
        const nextLine = lines[j]
        if (nextLine.trim() === "") {
          endLine = j
          continue
        }
        const nextIndent = nextLine.length - nextLine.trimStart().length
        if (nextIndent > indent) {
          endLine = j
        } else {
          break
        }
      }

      if (endLine > i) {
        const summary = lines[i].trim().slice(0, 40)
        const startOffset = this.lineAndColToOffset(i, 0, lines)
        const endOffset = this.lineAndColToOffset(
          endLine,
          (lines[endLine] || "").length,
          lines,
        )
        folds.set(i, {
          startLine: i,
          endLine,
          startOffset,
          endOffset,
          summary,
          folded: this._folds.get(i)?.folded ?? false,
        })
        i = endLine
      }
    }
  }

  private getJsonFoldSummary(
    lines: string[],
    startLine: number,
    endLine: number,
  ): string {
    const firstLine = lines[startLine].trim()
    const bracket = firstLine[0] === "{" ? "}" : "]"
    const lineCount = endLine - startLine
    return `${firstLine.slice(0, 30)}... ${bracket} (${lineCount} lines)`
  }

  private lineAndColToOffset(
    line: number,
    col: number,
    lines: string[],
  ): number {
    let offset = 0
    for (let i = 0; i < line; i++) {
      offset += lines[i].length + 1
    }
    return offset + col
  }
}

function countNewlinesBefore(newlinesAt: number[], offset: number): number {
  let count = 0
  for (const pos of newlinesAt) {
    if (pos < offset) count++
    else break
  }
  return count
}
