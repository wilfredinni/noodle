import type { KeyEvent, PasteEvent } from "@opentui/core"
import {
  SyntaxStyle,
  TextareaRenderable,
  getTreeSitterClient,
} from "@opentui/core"
import type { RenderContext, Highlight } from "@opentui/core"
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
}

export interface CodeEditorOptions {
  filetype: string
  theme: Theme
  debounceMs?: number
  foldable?: boolean
  initialValue?: string
  extraHighlights?: (content: string) => Highlight[]
  validateContent?: (content: string) => string | null
  onValidationChange?: (error: string | null) => void
  onContentChange?: () => void
  onFoldsChange?: () => void
  backgroundColor?: string
  textColor?: string
  focusedBackgroundColor?: string
  focusedTextColor?: string
  cursorColor?: string
}

interface SourceCursor {
  line: number
  col: number
}

function createTsSyntaxStyle(theme: Theme): SyntaxStyle {
  return SyntaxStyle.fromStyles({
    "json.key": { fg: theme.secondary },
    "json.string": { fg: theme.success },
    "json.number": { fg: theme.warning },
    "json.boolean": { fg: theme.info },
    "json.null": { fg: theme.info },
    "json.bracket": { fg: theme.textMuted },
    "json.text": { fg: theme.text },
    "yaml.key": { fg: theme.secondary },
    "yaml.string": { fg: theme.success },
    "yaml.number": { fg: theme.warning },
    "yaml.boolean": { fg: theme.info },
    "yaml.null": { fg: theme.info },
    "yaml.punctuation": { fg: theme.textMuted },
    "yaml.comment": { fg: theme.textMuted },
    "yaml.text": { fg: theme.text },
    string: { fg: theme.success },
    number: { fg: theme.warning },
    boolean: { fg: theme.info },
    constant: { fg: theme.info },
    "constant.builtin": { fg: theme.info },
    property: { fg: theme.secondary },
    comment: { fg: theme.textMuted },
    punctuation: { fg: theme.textMuted },
    "punctuation.delimiter": { fg: theme.textMuted },
    "punctuation.bracket": { fg: theme.textMuted },
    "punctuation.special": { fg: theme.textMuted },
    keyword: { fg: theme.info },
    "keyword.directive": { fg: theme.info },
    label: { fg: theme.info },
    type: { fg: theme.info },
    "string.escape": { fg: theme.success },
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
  private _onContentChange?: () => void
  private _onFoldsChange?: () => void
  private _envResolvedStyleId: number = 0
  private _envMissingStyleId: number = 0
  private _tsClient: TreeSitterClient
  private _tsStyle: SyntaxStyle
  private _lastTsError: boolean = false
  private _sourceText: string = ""
  private _displayMode: "source" | "folded" = "source"
  private _suppressContentChanged: boolean = false
  private _sourceLineToDisplayLine: Map<number, number> = new Map()
  private _displayLineToSourceLine: Map<number, number> = new Map()
  private _validateContent?: (content: string) => string | null
  private _validationError: string | null = null
  private _onValidationChange?: (error: string | null) => void

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
    this._validateContent = options.validateContent
    this._onValidationChange = options.onValidationChange
    this._onContentChange = options.onContentChange
    this._onFoldsChange = options.onFoldsChange
    this._tsClient = getTreeSitterClient()
    this._tsStyle = createTsSyntaxStyle(this._theme)
    this._envResolvedStyleId = this._tsStyle.getStyleId("env.resolved") ?? 0
    this._envMissingStyleId = this._tsStyle.getStyleId("env.missing") ?? 0
    this._sourceText = super.plainText
    this.rebuildSourceDisplayMaps(this._sourceText)
    this.refreshValidation(this._sourceText)

    this.editBuffer.on("content-changed", () => {
      if (!this.isDestroyed) {
        if (this._suppressContentChanged) return
        if (this._displayMode === "folded") return
        this._displayMode = "source"
        this._sourceText = super.plainText
        this.rebuildSourceDisplayMaps(this._sourceText)
        this.refreshValidation(this._sourceText)
        this.scheduleHighlight()
        this._onContentChange?.()
      }
    })

    if (this._sourceText.length > 0) {
      const content = this._sourceText
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

  override get plainText(): string {
    return this._sourceText
  }

  set filetype(value: string) {
    if (this._filetype !== value) {
      this._filetype = value
      this.clearAllHighlights()
      this._tsStyle = createTsSyntaxStyle(this._theme)
      this._envResolvedStyleId = this._tsStyle.getStyleId("env.resolved") ?? 0
      this._envMissingStyleId = this._tsStyle.getStyleId("env.missing") ?? 0
      this.refreshValidation(this._sourceText)
      this.scheduleHighlight()
      this.computeFoldRanges()
    }
  }

  get validateContent(): ((content: string) => string | null) | undefined {
    return this._validateContent
  }

  set validateContent(value: ((content: string) => string | null) | undefined) {
    this._validateContent = value
    this.refreshValidation(this._sourceText)
  }

  get validationError(): string | null {
    return this._validationError
  }

  get extraHighlights(): ((content: string) => Highlight[]) | undefined {
    return this._extraHighlights
  }

  set extraHighlights(value: ((content: string) => Highlight[]) | undefined) {
    this._extraHighlights = value
    if (this.isFoldedDisplay()) {
      this.applyFoldedDisplayHighlights(super.plainText)
    } else {
      this.scheduleHighlight()
    }
  }

  get foldable(): boolean {
    return this._foldable
  }

  set foldable(value: boolean) {
    this._foldable = value
    this._folds.clear()
    this.restoreSourceDisplay()
    this.requestRender()
  }

  getFolds(): Map<number, FoldInfo> {
    return new Map(this._folds)
  }

  getFoldSigns(): Map<number, { before: string; beforeColor: string }> {
    const signs = new Map<number, { before: string; beforeColor: string }>()
    for (const [line, fold] of this._folds) {
      if (this.isSourceLineHiddenByFold(line)) continue
      const displayLine =
        this._displayMode === "folded"
          ? this._sourceLineToDisplayLine.get(line)
          : line
      if (displayLine === undefined) continue
      signs.set(displayLine, {
        before: fold.folded ? "▶" : "▼",
        beforeColor: "#888888",
      })
    }
    return signs
  }

  getHiddenLineNumbers(): Set<number> {
    if (this._displayMode === "folded") return new Set()

    const hidden = new Set<number>()
    for (const fold of this._folds.values()) {
      if (!fold.folded) continue
      for (let line = fold.startLine + 1; line <= fold.endLine; line++) {
        hidden.add(line)
      }
    }
    return hidden
  }

  set theme(value: Theme) {
    this._theme = value
    this._tsStyle = createTsSyntaxStyle(this._theme)
    this._envResolvedStyleId = this._tsStyle.getStyleId("env.resolved") ?? 0
    this._envMissingStyleId = this._tsStyle.getStyleId("env.missing") ?? 0
    if (this.isFoldedDisplay()) {
      this.applyFoldedDisplayHighlights(super.plainText)
    } else {
      this.scheduleHighlight()
    }
  }

  get envResolvedStyleId(): number {
    return this._envResolvedStyleId
  }

  get envMissingStyleId(): number {
    return this._envMissingStyleId
  }

  toggleFold(line: number): void {
    const sourceLine = this.displayLineToSourceLine(line)
    const fold = this._folds.get(sourceLine)
    if (!fold) return

    if (fold.folded) {
      this.unfold(fold)
    } else {
      this.fold(fold)
    }
    this.applyFoldDisplay(sourceLine)
    this.requestRender()
  }

  private fold(fold: FoldInfo): void {
    fold.folded = true
    this._folds.set(fold.startLine, fold)
    this._onFoldsChange?.()
  }

  private unfold(fold: FoldInfo): void {
    fold.folded = false
    this._folds.set(fold.startLine, fold)
    this._onFoldsChange?.()
  }

  foldAll(): void {
    for (const fold of this._folds.values()) {
      if (!fold.folded) this.fold(fold)
    }
    this.applyFoldDisplay()
    this.requestRender()
  }

  unfoldAll(): void {
    const sourceCursor = this.isFoldedDisplay()
      ? this.getSourceCursorFromDisplay()
      : undefined
    for (const fold of this._folds.values()) {
      if (fold.folded) this.unfold(fold)
    }
    this.restoreSourceDisplay(undefined, sourceCursor)
    this.scheduleHighlight()
    this.requestRender()
  }

  override handlePaste(event: PasteEvent): void {
    if (this.hasFoldedRanges() && this.isFoldedDisplay()) {
      const sourceCursor = this.getSourceCursorFromDisplay()
      if (!this.isFoldedSummaryLine(sourceCursor.line)) {
        this.restoreSourceDisplay(undefined, sourceCursor)
        super.handlePaste(event)
        const editedSourceCursor = this.getSourceCursorFromDisplay()
        this.syncSourceTextFromDisplayedBuffer()
        this.computeFoldRanges()
        this.applyFoldDisplay(editedSourceCursor)
        this.scheduleHighlight()
        return
      }
      this.unfoldAll()
    }
    super.handlePaste(event)
    this.scheduleHighlight()
  }

  override handleKeyPress(key: KeyEvent): boolean {
    const normalizedKey: KeyEvent =
      key.name === "return" && key.shift
        ? ({ ...key, shift: false } as KeyEvent)
        : key

    if (key.ctrl && !key.meta && !key.option && !key.super && !key.hyper) {
      if (key.name === "g" && !key.shift) {
        this.toggleFold(this.logicalCursor.row)
        return true
      }
    }

    if (!key.ctrl && !key.meta && !key.option && !key.super && !key.hyper) {
      if (key.name === "f5") {
        this.foldAll()
        return true
      }
      if (key.name === "f6") {
        this.unfoldAll()
        return true
      }
    }

    if (
      key.ctrl &&
      key.shift &&
      !key.meta &&
      !key.option &&
      !key.super &&
      !key.hyper
    ) {
      if (key.name === "[") {
        this.foldAll()
        return true
      }
      if (key.name === "]") {
        this.unfoldAll()
        return true
      }
    }

    if (this.hasFoldedRanges() && this.isPotentialEditKey(key)) {
      if (this.isFoldedDisplay()) {
        const sourceCursor = this.getSourceCursorFromDisplay()
        if (!this.isFoldedSummaryLine(sourceCursor.line)) {
          this.restoreSourceDisplay(undefined, sourceCursor)
          const handled = super.handleKeyPress(normalizedKey)
          if (handled) {
            const editedSourceCursor = this.getSourceCursorFromDisplay()
            this.syncSourceTextFromDisplayedBuffer()
            this.computeFoldRanges()
            this.applyFoldDisplay(editedSourceCursor)
            this.scheduleHighlight()
          }
          return handled
        }
      }
      this.unfoldAll()
    }

    const handled = super.handleKeyPress(normalizedKey)
    if (handled) {
      this.scheduleHighlight()
    }
    return handled
  }

  private isSourceLineHiddenByFold(line: number): boolean {
    for (const fold of this._folds.values()) {
      if (!fold.folded) continue
      if (line > fold.startLine && line <= fold.endLine) return true
    }
    return false
  }

  protected override onResize(width: number, height: number): void {
    super.onResize(width, height)
  }

  private hasFoldedRanges(): boolean {
    for (const fold of this._folds.values()) {
      if (fold.folded) return true
    }
    return false
  }

  private isFoldedDisplay(): boolean {
    return this._displayMode === "folded"
  }

  private applyFoldDisplay(preferredSourceLine?: number | SourceCursor): void {
    if (!this.hasFoldedRanges()) {
      if (typeof preferredSourceLine === "object") {
        this.restoreSourceDisplay(undefined, preferredSourceLine)
      } else {
        this.restoreSourceDisplay(preferredSourceLine)
      }
      return
    }

    const lines = this._sourceText.split("\n")
    const displayLines: string[] = []
    const sourceToDisplay = new Map<number, number>()
    const displayToSource = new Map<number, number>()

    for (let sourceLine = 0; sourceLine < lines.length; ) {
      const displayLine = displayLines.length
      const fold = this._folds.get(sourceLine)

      if (fold?.folded) {
        sourceToDisplay.set(sourceLine, displayLine)
        displayToSource.set(displayLine, sourceLine)
        displayLines.push(`${getLineIndent(lines[sourceLine])}${fold.summary}`)
        sourceLine = fold.endLine + 1
        continue
      }

      sourceToDisplay.set(sourceLine, displayLine)
      displayToSource.set(displayLine, sourceLine)
      displayLines.push(lines[sourceLine])
      sourceLine++
    }

    this._displayMode = "folded"
    this._sourceLineToDisplayLine = sourceToDisplay
    this._displayLineToSourceLine = displayToSource
    const foldedDisplayText = displayLines.join("\n")
    this.setDisplayedText(foldedDisplayText)
    this.applyFoldedDisplayHighlights(foldedDisplayText)
    if (typeof preferredSourceLine === "object") {
      this.moveCursorToSourceCursor(preferredSourceLine)
    } else {
      this.moveCursorToSourceLine(preferredSourceLine)
    }
  }

  private restoreSourceDisplay(
    preferredSourceLine?: number,
    preferredSourceCursor?: SourceCursor,
  ): void {
    const wasFolded = this._displayMode === "folded"
    this._displayMode = "source"
    this.rebuildSourceDisplayMaps(this._sourceText)
    if (wasFolded || super.plainText !== this._sourceText) {
      this.setDisplayedText(this._sourceText)
    }
    if (preferredSourceCursor) {
      this.moveCursorToSourceCursor(preferredSourceCursor)
    } else {
      this.moveCursorToSourceLine(preferredSourceLine)
    }
  }

  private setDisplayedText(text: string): void {
    this._suppressContentChanged = true
    try {
      super.setText(text)
    } finally {
      this._suppressContentChanged = false
    }
  }

  private syncSourceTextFromDisplayedBuffer(): void {
    this._sourceText = super.plainText
    this.rebuildSourceDisplayMaps(this._sourceText)
    this.refreshValidation(this._sourceText)
  }

  private applyFoldedDisplayHighlights(displayText: string): void {
    if (displayText.length === 0) {
      this.clearAllHighlights()
      return
    }

    if (this._filetype === "json") {
      this.applyJsonHighlights(displayText)
    } else if (this._filetype === "yaml") {
      this.applyYamlHighlights(displayText)
    } else {
      this.clearAllHighlights()
    }

    try {
      this.applyExtraHighlights(displayText)
    } catch {
      // extraHighlights callback may throw on malformed content
    }
  }

  private rebuildSourceDisplayMaps(content: string): void {
    const lines = content.split("\n")
    this._sourceLineToDisplayLine = new Map()
    this._displayLineToSourceLine = new Map()
    for (let line = 0; line < lines.length; line++) {
      this._sourceLineToDisplayLine.set(line, line)
      this._displayLineToSourceLine.set(line, line)
    }
  }

  private displayLineToSourceLine(displayLine: number): number {
    if (this._displayMode !== "folded") return displayLine
    return this._displayLineToSourceLine.get(displayLine) ?? displayLine
  }

  private isFoldedSummaryLine(sourceLine: number): boolean {
    return this._folds.get(sourceLine)?.folded ?? false
  }

  private refreshValidation(content: string): void {
    const nextError = this.resolveValidationError(content)
    if (nextError === this._validationError) return
    this._validationError = nextError
    this._onValidationChange?.(nextError)
  }

  private resolveValidationError(content: string): string | null {
    if (this._validateContent) {
      return this._validateContent(content)
    }

    if (this._filetype === "json") {
      if (content.trim() === "") return null
      try {
        JSON.parse(content)
        return null
      } catch (error) {
        return error instanceof Error ? error.message : String(error)
      }
    }

    return null
  }

  private getSourceCursorFromDisplay(): SourceCursor {
    const cursor = this.logicalCursor
    return {
      line: this.displayLineToSourceLine(cursor.row),
      col: cursor.col,
    }
  }

  private moveCursorToSourceLine(sourceLine?: number): void {
    if (sourceLine === undefined) return
    const displayLine = this._sourceLineToDisplayLine.get(sourceLine)
    if (displayLine === undefined) return
    this.editBuffer.setCursor(displayLine, 0)
  }

  private moveCursorToSourceCursor(sourceCursor: SourceCursor): void {
    const displayLine = this._sourceLineToDisplayLine.get(sourceCursor.line)
    if (displayLine === undefined) return
    const sourceLineText = this._sourceText.split("\n")[sourceCursor.line] ?? ""
    this.editBuffer.setCursor(
      displayLine,
      Math.min(sourceCursor.col, sourceLineText.length),
    )
  }

  private isPotentialEditKey(key: KeyEvent): boolean {
    if (key.name === "backspace" || key.name === "delete") return true
    if (key.name === "return" || key.name === "linefeed") return true

    if (key.ctrl) {
      return ["d", "k", "u", "w", "z", ".", "-"].includes(key.name)
    }

    if (key.meta || key.option || key.super || key.hyper) return false
    if (!key.sequence) return false

    return key.sequence.length > 0 && key.sequence.charCodeAt(0) >= 32
  }

  override destroy(): void {
    if (this._highlightTimer) {
      clearTimeout(this._highlightTimer)
      this._highlightTimer = null
    }

    this._folds.clear()

    super.destroy()
  }

  private scheduleHighlight(): void {
    this._highlightSnapshotId++
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

    if (content.length === 0 || content.length > 100_000) {
      this.clearAllHighlights()
      if (this._folds.size > 0) {
        this._folds.clear()
        this._onFoldsChange?.()
        this.requestRender()
      }
      return
    }
    if (this.isFoldedDisplay()) return

    let tsSuccess = false

    try {
      const result = await this._tsClient.highlightOnce(content, this._filetype)

      if (snapshotId !== this._highlightSnapshotId) return
      if (this.isDestroyed) return
      if (this.isFoldedDisplay()) return

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
    if (this.isFoldedDisplay()) return

    if (!tsSuccess) {
      this.clearAllHighlights()
    }

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
    const displayOffsets = buildByteToDisplayOffsets(content)

    for (const [start, end, group] of highlights) {
      if (start >= end) continue
      const styleId = style.getStyleId(group)
      if (styleId === null) continue

      this.addHighlightByCharRange({
        start: byteOffsetToDisplayOffset(displayOffsets, start),
        end: byteOffsetToDisplayOffset(displayOffsets, end),
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
      const styleId = styleIdForJsonToken(
        token.kind,
        token.fg,
        this._theme,
        style,
      )
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
    const prevFolds = this._folds
    const newFolds = new Map<number, FoldInfo>()

    if (this._filetype === "json") {
      this.computeJsonFoldRanges(content, newFolds)
    } else if (this._filetype === "yaml") {
      this.computeYamlFoldRanges(content, newFolds)
    }

    this._folds = newFolds

    for (const [line, fold] of newFolds) {
      const previous = prevFolds.get(line)
      fold.folded = previous?.folded ?? fold.folded
    }

    if (this.hasFoldedRanges()) this.applyFoldDisplay()
    this._onFoldsChange?.()
    this.requestRender()
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
                const summary = this.getJsonFoldSummary(
                  lines,
                  startLine,
                  i,
                  stack[k].char,
                )
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
    openingChar: string,
  ): string {
    const firstLine = lines[startLine].trim()
    const bracket = openingChar === "{" ? "}" : "]"
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

function buildByteToDisplayOffsets(content: string): number[] {
  const offsets: number[] = []
  offsets[0] = 0
  let displayOffset = 0
  let byteOffset = 0

  for (const char of content) {
    const codePoint = char.codePointAt(0)
    if (codePoint === undefined) continue

    byteOffset += utf8ByteLength(codePoint)
    if (char !== "\n") {
      displayOffset++
    }

    offsets[byteOffset] = displayOffset
  }
  return offsets
}

function styleIdForJsonToken(
  kind: string | undefined,
  fg: string,
  theme: Theme,
  style: SyntaxStyle,
): number {
  if (kind === "key") return style.getStyleId("json.key") ?? 0
  if (kind === "string") return style.getStyleId("json.string") ?? 0
  if (kind === "number") return style.getStyleId("json.number") ?? 0
  if (kind === "boolean") return style.getStyleId("json.boolean") ?? 0
  if (kind === "null") return style.getStyleId("json.null") ?? 0
  if (kind === "bracket") return style.getStyleId("json.bracket") ?? 0
  if (kind === "punctuation") return style.getStyleId("json.bracket") ?? 0
  if (kind === "text") return style.getStyleId("json.text") ?? 0

  if (fg === theme.secondary) return style.getStyleId("json.key") ?? 0
  if (fg === theme.success) return style.getStyleId("json.string") ?? 0
  if (fg === theme.warning) return style.getStyleId("json.number") ?? 0
  if (fg === theme.info) return style.getStyleId("json.boolean") ?? 0
  if (fg === theme.textMuted) return style.getStyleId("json.bracket") ?? 0
  return style.getStyleId("json.text") ?? 0
}

function byteOffsetToDisplayOffset(
  offsets: number[],
  byteOffset: number,
): number {
  if (byteOffset <= 0) return 0
  for (let i = byteOffset; i >= 0; i--) {
    const value = offsets[i]
    if (value !== undefined) return value
  }
  return 0
}

function getLineIndent(line: string): string {
  const match = /^\s*/.exec(line)
  return match?.[0] ?? ""
}

function utf8ByteLength(codePoint: number): number {
  if (codePoint <= 0x7f) return 1
  if (codePoint <= 0x7ff) return 2
  if (codePoint <= 0xffff) return 3
  return 4
}
