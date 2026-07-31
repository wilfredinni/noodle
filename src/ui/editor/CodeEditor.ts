import type {
  Highlight,
  KeyEvent,
  PasteEvent,
  RenderContext,
  TreeSitterClient,
} from "@opentui/core"
import { getTreeSitterClient, TextareaRenderable } from "@opentui/core"
import type { Theme } from "../theme-data"
import {
  getAutoCloseCharacter,
  getEditorCommand,
  isPotentialEditKey,
  normalizeEditorKey,
  shouldAutoSkipClosingCharacter,
} from "./codeEditorKeys"
import type { EditorHighlightRange } from "./codeEditorHighlighting"
import { CodeEditorFoldManager } from "./codeEditorFoldManager"
import {
  CodeEditorValidation,
  type CodeEditorValidator,
} from "./codeEditorValidation"
import { CodeEditorHighlightRenderer } from "./codeEditorHighlightRenderer"

export type { FoldInfo } from "./codeEditorFolds"

export interface CodeEditorOptions {
  filetype: string
  theme: Theme
  debounceMs?: number
  foldable?: boolean
  initialValue?: string
  value?: string
  scrollMargin?: number
  extraHighlights?: (content: string) => Highlight[]
  validateContent?: CodeEditorValidator
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
  private _debounceMs: number
  private _highlightTimer: ReturnType<typeof setTimeout> | null = null
  private _highlightSnapshotId = 0
  private _onContentChange?: () => void
  private _onFoldsChange?: () => void
  private _tsClient: TreeSitterClient
  private _suppressContentChanged = false
  private _renderSuppressed = false
  private _validation: CodeEditorValidation
  private _foldManager: CodeEditorFoldManager
  private _highlights: CodeEditorHighlightRenderer

  constructor(ctx: RenderContext, options: CodeEditorOptions) {
    super(ctx, {
      initialValue: options.value ?? options.initialValue,
      backgroundColor: options.backgroundColor ?? "transparent",
      textColor: options.textColor ?? "#FFFFFF",
      focusedBackgroundColor: options.focusedBackgroundColor ?? "transparent",
      focusedTextColor: options.focusedTextColor ?? "#FFFFFF",
      cursorColor: options.cursorColor ?? "#FFFFFF",
      scrollMargin: options.scrollMargin,
    })
    this._filetype = options.filetype
    this._debounceMs = options.debounceMs ?? 200
    this._onContentChange = options.onContentChange
    this._onFoldsChange = options.onFoldsChange
    this._tsClient = getTreeSitterClient()
    this._highlights = new CodeEditorHighlightRenderer(
      options.theme,
      options.extraHighlights,
      {
        clear: () => this.clearAllHighlights(),
        setStyle: (style) => {
          this.syntaxStyle = style
        },
        applyRanges: (ranges) => this.applyHighlightRanges(ranges),
      },
    )
    this._validation = new CodeEditorValidation(
      this._filetype,
      options.validateContent,
      options.onValidationChange,
    )
    this._foldManager = new CodeEditorFoldManager(
      super.plainText,
      this._filetype,
      options.foldable ?? true,
      {
        getDisplayedText: () => super.plainText,
        setDisplayedText: (text) => this.setDisplayedText(text),
        getCursor: () => ({
          line: this.logicalCursor.row,
          col: this.logicalCursor.col,
        }),
        setCursor: (line, col) => this.editBuffer.setCursor(line, col),
        withRenderSuppressed: (action) => this.withRenderSuppressed(action),
        applyDisplayHighlights: (text) =>
          this._highlights.apply(text, this._filetype),
        scheduleHighlight: () => this.scheduleHighlight(),
        requestRender: () => this.requestRender(),
        onSourceTextChange: (content) => this._validation.refresh(content),
        onFoldsChange: () => this._onFoldsChange?.(),
      },
    )
    this._validation.refresh(this._foldManager.sourceText)

    this.editBuffer.on("content-changed", () => {
      if (this.isDestroyed || this._suppressContentChanged) return
      if (this._foldManager.isFoldedDisplay) return
      this._foldManager.setSourceText(super.plainText)
      this.scheduleHighlight()
      this._onContentChange?.()
    })

    if (this._foldManager.sourceText.length > 0) {
      this._highlights.apply(this._foldManager.sourceText, this._filetype)
      this.scheduleHighlight()
    }
  }
  get filetype(): string {
    return this._filetype
  }
  override get plainText(): string {
    return this._foldManager.sourceText
  }
  get value(): string {
    return this.plainText
  }
  set value(value: string) {
    if (this.plainText === value) return
    this._foldManager.setSourceText(value)
    this._foldManager.clearFolds()
    this.setDisplayedText(value)
    this._highlights.apply(value, this._filetype)
    this.scheduleHighlight()
  }
  set filetype(value: string) {
    if (this._filetype === value) return
    this._filetype = value
    this._highlights.clear()
    this._validation.setFiletype(value, this.plainText)
    this.scheduleHighlight()
    this._foldManager.setFiletype(value)
  }
  get validateContent(): CodeEditorValidator | undefined {
    return this._validation.validator
  }
  set validateContent(value: CodeEditorValidator | undefined) {
    this._validation.setValidator(value, this.plainText)
  }
  get validationError(): string | null {
    return this._validation.error
  }
  get onValidationChange(): ((error: string | null) => void) | undefined {
    return this._validation.listener
  }
  set onValidationChange(value: ((error: string | null) => void) | undefined) {
    this._validation.setListener(value)
  }
  get extraHighlights(): ((content: string) => Highlight[]) | undefined {
    return this._highlights.extra
  }
  set extraHighlights(value: ((content: string) => Highlight[]) | undefined) {
    this._highlights.setExtra(value)
    if (this._foldManager.isFoldedDisplay) {
      this._highlights.apply(super.plainText, this._filetype)
    } else {
      this.scheduleHighlight()
    }
  }
  get foldable(): boolean {
    return this._foldManager.foldable
  }
  set foldable(value: boolean) {
    this._foldManager.setFoldable(value)
  }
  getFolds() {
    return this._foldManager.getFolds()
  }

  getFoldSigns() {
    return this._foldManager.getFoldSigns()
  }

  getHiddenLineNumbers() {
    return this._foldManager.getHiddenLineNumbers()
  }

  set theme(value: Theme) {
    this._highlights.setTheme(value)
    if (this._foldManager.isFoldedDisplay) {
      this._highlights.apply(super.plainText, this._filetype)
    } else {
      this.scheduleHighlight()
    }
  }

  get envResolvedStyleId(): number {
    return this._highlights.envResolvedStyleId
  }

  get envMissingStyleId(): number {
    return this._highlights.envMissingStyleId
  }

  refreshHighlights(): void {
    void this.highlight()
  }

  toggleFold(line: number): void {
    this._foldManager.toggleFold(line)
  }

  foldAll(): void {
    this._foldManager.foldAll()
  }

  unfoldAll(): void {
    this._foldManager.unfoldAll()
  }

  scrollByViewport(delta: number): void {
    this.scrollBy(delta * this.height)
  }

  scrollBy(delta: number): void {
    const move =
      delta < 0 ? this.moveCursorUp.bind(this) : this.moveCursorDown.bind(this)
    for (
      let step = 0;
      step < Math.max(1, Math.round(Math.abs(delta)));
      step++
    ) {
      move()
    }
  }

  override requestRender(): void {
    if (!this._renderSuppressed) super.requestRender()
  }

  override handlePaste(event: PasteEvent): void {
    if (
      this._foldManager.hasFoldedRanges() &&
      this._foldManager.isFoldedDisplay
    ) {
      const cursor = this._foldManager.getSourceCursorFromDisplay()
      if (!this._foldManager.isFoldedSummaryLine(cursor.line)) {
        this._foldManager.restoreSourceDisplay(undefined, cursor)
        super.handlePaste(event)
        this._foldManager.syncFoldDisplayAfterEdit()
        return
      }
      this._foldManager.unfoldAll()
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
    if (
      key.ctrl &&
      !key.meta &&
      !key.option &&
      !key.super &&
      !key.hyper &&
      key.name === "z"
    ) {
      this._foldManager.unfoldAll()
      if (key.shift) this.redo()
      else this.undo()
      this._foldManager.setSourceText(super.plainText)
      this._onContentChange?.()
      this.scheduleHighlight()
      return true
    }
    if (this.shouldAutoSkip(key)) {
      this.editBuffer.moveCursorRight()
      return true
    }

    const closeChar = getAutoCloseCharacter(key)
    if (closeChar !== undefined) return this.handleAutoClose(key, closeChar)
    if (this._foldManager.hasFoldedRanges() && isPotentialEditKey(key)) {
      if (this._foldManager.isFoldedDisplay) {
        const cursor = this._foldManager.getSourceCursorFromDisplay()
        if (!this._foldManager.isFoldedSummaryLine(cursor.line)) {
          this._foldManager.restoreSourceDisplay(undefined, cursor)
          const handled = super.handleKeyPress(normalizeEditorKey(key))
          if (handled) this._foldManager.syncFoldDisplayAfterEdit()
          return handled
        }
      }
      this._foldManager.unfoldAll()
    }
    const handled = super.handleKeyPress(normalizeEditorKey(key))
    if (handled) this.scheduleHighlight()
    return handled
  }

  override destroy(): void {
    if (this._highlightTimer) clearTimeout(this._highlightTimer)
    super.destroy()
  }

  private handleAutoClose(key: KeyEvent, closeChar: string): boolean {
    if (this._foldManager.hasFoldedRanges() && isPotentialEditKey(key)) {
      if (this._foldManager.isFoldedDisplay) {
        const cursor = this._foldManager.getSourceCursorFromDisplay()
        if (!this._foldManager.isFoldedSummaryLine(cursor.line)) {
          this._foldManager.restoreSourceDisplay(undefined, cursor)
          this.insertAutoClosePair(key.sequence, closeChar)
          this._foldManager.syncFoldDisplayAfterEdit()
          return true
        }
      }
      this._foldManager.unfoldAll()
    }
    this.insertAutoClosePair(key.sequence, closeChar)
    this.scheduleHighlight()
    return true
  }

  private shouldAutoSkip(key: KeyEvent): boolean {
    if (this._foldManager.isFoldedDisplay) return false
    const cursor = this.logicalCursor
    return shouldAutoSkipClosingCharacter(
      key,
      this.editBuffer.getText(),
      this.editBuffer.positionToOffset(cursor.row, cursor.col),
    )
  }

  private insertAutoClosePair(open: string, close: string): void {
    if (this.hasSelection()) {
      const selection = this.getSelection()
      if (selection) {
        this.insertText(
          `${open}${this.getTextRange(selection.start, selection.end)}${close}`,
        )
        this.editBuffer.moveCursorLeft()
        return
      }
    }
    this.insertText(open + close)
    this.editBuffer.moveCursorLeft()
  }

  private withRenderSuppressed(action: () => void): void {
    const suppressed = this._renderSuppressed
    this._renderSuppressed = true
    try {
      action()
    } finally {
      this._renderSuppressed = suppressed
      if (!suppressed) super.requestRender()
    }
  }

  private setDisplayedText(text: string): void {
    this._suppressContentChanged = true
    try {
      this.editBuffer.setText(text)
      this.yogaNode.markDirty()
    } finally {
      this._suppressContentChanged = false
    }
  }

  private scheduleHighlight(): void {
    this._highlightSnapshotId++
    if (this._highlightTimer) clearTimeout(this._highlightTimer)
    this._highlightTimer = setTimeout(() => {
      this._highlightTimer = null
      this.highlight()
    }, this._debounceMs)
  }

  private async highlight(): Promise<void> {
    const snapshotId = ++this._highlightSnapshotId
    const content = this.plainText
    if (content.length === 0 || content.length > 100_000) {
      this._highlights.clear()
      this._foldManager.clearFolds()
      return
    }
    if (this._foldManager.isFoldedDisplay) return

    await this._highlights.highlight(
      content,
      this._filetype,
      this._tsClient,
      () =>
        snapshotId === this._highlightSnapshotId &&
        !this.isDestroyed &&
        !this._foldManager.isFoldedDisplay,
    )
    if (
      snapshotId !== this._highlightSnapshotId ||
      this.isDestroyed ||
      this._foldManager.isFoldedDisplay
    )
      return
    this.computeFoldRanges()
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
    this._foldManager.computeFoldRanges()
  }
}
