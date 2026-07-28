import type { KeyEvent, PasteEvent } from "@opentui/core"
import {
  SyntaxStyle,
  TextareaRenderable,
  getTreeSitterClient,
} from "@opentui/core"
import type { RenderContext, Highlight } from "@opentui/core"
import type { SimpleHighlight } from "@opentui/core"
import type { TreeSitterClient } from "@opentui/core"
import type { Theme } from "../theme-data"
import {
  buildFoldDisplay,
  buildSourceDisplayMaps,
  computeFoldRanges as deriveFoldRanges,
  hasFoldedRanges,
  isSourceLineHiddenByFold,
  type FoldInfo,
  type SourceCursor,
} from "./codeEditorFolds"
import { getEnvStyleIds, createCodeEditorSyntaxStyle } from "./codeEditorStyles"
import {
  getAutoCloseCharacter,
  getEditorCommand,
  isPotentialEditKey,
  normalizeEditorKey,
  shouldAutoSkipClosingCharacter,
} from "./codeEditorKeys"
import {
  buildExtraHighlightRanges,
  buildJsonHighlightRanges,
  buildTreeSitterHighlightRanges,
  buildYamlHighlightRanges,
  type EditorHighlightRange,
} from "./codeEditorHighlighting"

export type { FoldInfo } from "./codeEditorFolds"

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
  private _renderSuppressed = false
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
    this._tsStyle = createCodeEditorSyntaxStyle(this._theme)
    this.updateEnvStyleIds()
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
      this._tsStyle = createCodeEditorSyntaxStyle(this._theme)
      this.updateEnvStyleIds()
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

  get onValidationChange(): ((error: string | null) => void) | undefined {
    return this._onValidationChange
  }

  set onValidationChange(value: ((error: string | null) => void) | undefined) {
    if (value === this._onValidationChange) return
    this._onValidationChange = value
    value?.(this._validationError)
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
      if (isSourceLineHiddenByFold(line, this._folds)) continue
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
    this._tsStyle = createCodeEditorSyntaxStyle(this._theme)
    this.updateEnvStyleIds()
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

  refreshHighlights(): void {
    void this.highlight()
  }

  override requestRender(): void {
    if (this._renderSuppressed) return
    super.requestRender()
  }

  private withRenderSuppressed(action: () => void): void {
    const wasSuppressed = this._renderSuppressed
    this._renderSuppressed = true
    try {
      action()
    } finally {
      this._renderSuppressed = wasSuppressed
      if (!wasSuppressed) super.requestRender()
    }
  }

  private updateEnvStyleIds(): void {
    const { resolved, missing } = getEnvStyleIds(this._tsStyle)
    this._envResolvedStyleId = resolved
    this._envMissingStyleId = missing
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
    this._onFoldsChange?.()
  }

  private fold(fold: FoldInfo): void {
    fold.folded = true
    this._folds.set(fold.startLine, fold)
  }

  private unfold(fold: FoldInfo): void {
    fold.folded = false
    this._folds.set(fold.startLine, fold)
  }

  foldAll(): void {
    let changed = false
    for (const fold of this._folds.values()) {
      if (!fold.folded) {
        this.fold(fold)
        changed = true
      }
    }
    if (!changed) return
    this.applyFoldDisplay()
    this._onFoldsChange?.()
  }

  unfoldAll(): void {
    const sourceCursor = this.isFoldedDisplay()
      ? this.getSourceCursorFromDisplay()
      : undefined
    let changed = false
    for (const fold of this._folds.values()) {
      if (fold.folded) {
        this.unfold(fold)
        changed = true
      }
    }
    if (!changed) return
    this.restoreSourceDisplay(undefined, sourceCursor)
    this._onFoldsChange?.()
  }

  override handlePaste(event: PasteEvent): void {
    if (this.hasFoldedRanges() && this.isFoldedDisplay()) {
      const sourceCursor = this.getSourceCursorFromDisplay()
      if (!this.isFoldedSummaryLine(sourceCursor.line)) {
        this.restoreSourceDisplay(undefined, sourceCursor)
        super.handlePaste(event)
        this.syncFoldDisplayAfterEdit()
        return
      }
      this.unfoldAll()
    }
    super.handlePaste(event)
    this.scheduleHighlight()
  }

  override handleKeyPress(key: KeyEvent): boolean {
    const command = getEditorCommand(key)
    if (command === "toggle-fold") {
      this.toggleFold(this.logicalCursor.row)
      return true
    }
    if (command === "fold-all") {
      this.foldAll()
      return true
    }
    if (command === "unfold-all") {
      this.unfoldAll()
      return true
    }

    if (this.shouldAutoSkip(key)) {
      this.editBuffer.moveCursorRight()
      return true
    }

    const closeChar = getAutoCloseCharacter(key)
    if (closeChar !== undefined) {
      if (this.hasFoldedRanges() && isPotentialEditKey(key)) {
        if (this.isFoldedDisplay()) {
          const sourceCursor = this.getSourceCursorFromDisplay()
          if (!this.isFoldedSummaryLine(sourceCursor.line)) {
            this.restoreSourceDisplay(undefined, sourceCursor)
            this.insertAutoClosePair(key.sequence, closeChar)
            this.syncFoldDisplayAfterEdit()
            return true
          }
        }
        this.unfoldAll()
      }
      this.insertAutoClosePair(key.sequence, closeChar)
      this.scheduleHighlight()
      return true
    }

    if (this.hasFoldedRanges() && isPotentialEditKey(key)) {
      if (this.isFoldedDisplay()) {
        const sourceCursor = this.getSourceCursorFromDisplay()
        if (!this.isFoldedSummaryLine(sourceCursor.line)) {
          this.restoreSourceDisplay(undefined, sourceCursor)
          const handled = super.handleKeyPress(normalizeEditorKey(key))
          if (handled) {
            this.syncFoldDisplayAfterEdit()
          }
          return handled
        }
      }
      this.unfoldAll()
    }

    const handled = super.handleKeyPress(normalizeEditorKey(key))
    if (handled) {
      this.scheduleHighlight()
    }
    return handled
  }

  private shouldAutoSkip(key: KeyEvent): boolean {
    if (this.isFoldedDisplay()) return false
    const cursor = this.logicalCursor
    const offset = this.editBuffer.positionToOffset(cursor.row, cursor.col)
    return shouldAutoSkipClosingCharacter(
      key,
      this.editBuffer.getText(),
      offset,
    )
  }

  private insertAutoClosePair(openChar: string, closeChar: string): void {
    if (this.hasSelection()) {
      const sel = this.getSelection()
      if (sel) {
        const selectedText = this.getTextRange(sel.start, sel.end)
        this.insertText(openChar + selectedText + closeChar)
        this.editBuffer.moveCursorLeft()
        return
      }
    }

    this.insertText(openChar + closeChar)
    this.editBuffer.moveCursorLeft()
  }

  private hasFoldedRanges(): boolean {
    return hasFoldedRanges(this._folds)
  }

  private isFoldedDisplay(): boolean {
    return this._displayMode === "folded"
  }

  private applyFoldDisplay(preferredSourceLine?: number | SourceCursor): void {
    this.withRenderSuppressed(() => {
      this.applyFoldDisplayInternal(preferredSourceLine)
    })
  }

  private applyFoldDisplayInternal(
    preferredSourceLine?: number | SourceCursor,
  ): void {
    if (!this.hasFoldedRanges()) {
      if (typeof preferredSourceLine === "object") {
        this.restoreSourceDisplay(undefined, preferredSourceLine)
      } else {
        this.restoreSourceDisplay(preferredSourceLine)
      }
      return
    }

    const display = buildFoldDisplay(this._sourceText, this._folds)

    this._displayMode = "folded"
    this._sourceLineToDisplayLine = display.sourceLineToDisplayLine
    this._displayLineToSourceLine = display.displayLineToSourceLine
    this.setDisplayedText(display.text)
    this.applyFoldedDisplayHighlights(display.text)
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
    this.withRenderSuppressed(() => {
      this.restoreSourceDisplayInternal(
        preferredSourceLine,
        preferredSourceCursor,
      )
    })
  }

  private restoreSourceDisplayInternal(
    preferredSourceLine?: number,
    preferredSourceCursor?: SourceCursor,
  ): void {
    const wasFolded = this._displayMode === "folded"
    this._displayMode = "source"
    this.rebuildSourceDisplayMaps(this._sourceText)
    if (wasFolded || super.plainText !== this._sourceText) {
      this.setDisplayedText(this._sourceText)
      this.applyFoldedDisplayHighlights(this._sourceText)
    }
    if (wasFolded) {
      this.scheduleHighlight()
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
      // Update the backing buffer without the immediate render requested by
      // TextareaRenderable.setText(). Folded text and its highlights must be
      // published together to avoid a transient unstyled frame.
      this.editBuffer.setText(text)
      this.yogaNode.markDirty()
    } finally {
      this._suppressContentChanged = false
    }
  }

  private syncFoldDisplayAfterEdit(): void {
    const editedSourceCursor = this.getSourceCursorFromDisplay()
    this.syncSourceTextFromDisplayedBuffer()
    this.computeFoldRanges()
    this.applyFoldDisplay(editedSourceCursor)
    this.scheduleHighlight()
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
    const maps = buildSourceDisplayMaps(content)
    this._sourceLineToDisplayLine = maps.sourceLineToDisplayLine
    this._displayLineToSourceLine = maps.displayLineToSourceLine
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

    if (this._filetype === "json") {
      // JSON requests may contain Noodle variables, which are intentionally
      // not valid JSON until send-time substitution. The local tokenizer
      // still highlights keys, strings, numbers, and punctuation correctly.
      this.applyJsonHighlights(content)
      tsSuccess = true
      this._lastTsError = false
    } else {
      try {
        const result = await this._tsClient.highlightOnce(
          content,
          this._filetype,
        )

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
    }

    if (snapshotId !== this._highlightSnapshotId) return
    if (this.isDestroyed) return
    if (this.isFoldedDisplay()) return

    if (!tsSuccess) {
      this.clearAllHighlights()
      if (this._filetype === "yaml") {
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
    this.syntaxStyle = this._tsStyle
    this.applyHighlightRanges(
      buildTreeSitterHighlightRanges(highlights, content, this._tsStyle),
    )
  }

  private applyJsonHighlights(content: string): void {
    this.clearAllHighlights()
    this.syntaxStyle = this._tsStyle
    this.applyHighlightRanges(
      buildJsonHighlightRanges(content, this._theme, this._tsStyle),
    )
  }

  private applyYamlHighlights(content: string): void {
    this.clearAllHighlights()
    this.syntaxStyle = this._tsStyle
    this.applyHighlightRanges(
      buildYamlHighlightRanges(content, this._theme, this._tsStyle),
    )
  }

  private applyExtraHighlights(content: string): void {
    if (!this._extraHighlights) return

    this.applyHighlightRanges(
      buildExtraHighlightRanges(content, this._extraHighlights(content)),
    )
  }

  private applyHighlightRanges(ranges: EditorHighlightRange[]): void {
    for (const range of ranges) {
      this.addHighlightByCharRange({
        start: range.start,
        end: range.end,
        styleId: range.styleId,
        priority: range.priority,
      })
    }
  }

  private computeFoldRanges(): void {
    if (!this._foldable) return

    this._folds = deriveFoldRanges(this.plainText, this._filetype, this._folds)

    const hasFoldedRanges = this.hasFoldedRanges()
    if (hasFoldedRanges) this.applyFoldDisplay()
    this._onFoldsChange?.()
    if (!hasFoldedRanges) this.requestRender()
  }
}
