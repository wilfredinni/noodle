import type {
  Highlight,
  KeyEvent,
  PasteEvent,
  RenderContext,
  RenderableOptions,
  ScrollBarOptions,
  TreeSitterClient,
} from "@opentui/core"
import {
  getTreeSitterClient,
  ScrollBarRenderable,
  TextareaRenderable,
} from "@opentui/core"
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
import { highlightJsonTokens } from "./syntax"

export type { FoldInfo } from "./codeEditorFolds"

export interface CodeEditorOptions extends Pick<
  RenderableOptions,
  "flexGrow" | "flexShrink" | "flexBasis" | "minHeight"
> {
  id?: string
  filetype: string
  theme: Theme
  debounceMs?: number
  foldable?: boolean
  readOnly?: boolean
  initialValue?: string
  value?: string
  scrollMargin?: number
  extraHighlights?: (content: string) => Highlight[]
  validateContent?: CodeEditorValidator
  onValidationChange?: (error: string | null) => void
  onSourceChange?: () => void
  onFoldsChange?: () => void
  backgroundColor?: string
  textColor?: string
  focusedBackgroundColor?: string
  focusedTextColor?: string
  cursorColor?: string
}

export interface CodeEditorScrollBarOptions extends Omit<
  ScrollBarOptions,
  "orientation" | "onChange"
> {
  target: CodeEditorRenderable | null
}

export class CodeEditorRenderable extends TextareaRenderable {
  private _filetype: string
  private _theme: Theme
  private _debounceMs: number
  private _highlightTimer: ReturnType<typeof setTimeout> | null = null
  private _highlightSnapshotId = 0
  private _onSourceChange?: () => void
  private _onFoldsChange?: () => void
  private _tsClient: TreeSitterClient
  private _suppressContentChanged = false
  private _renderSuppressed = false
  private _validation: CodeEditorValidation
  private _foldManager: CodeEditorFoldManager
  private _highlights: CodeEditorHighlightRenderer
  private _readOnly: boolean
  private _readonlyHighlightTimer: ReturnType<typeof setTimeout> | null = null
  private _readonlyHighlightedLines = new Set<number>()
  private _readonlyTreeSitterContent: string | null = null
  private _readonlyTreeSitterFiletype: string | null = null
  private _readonlyTreeSitterHighlight: Promise<void> | null = null
  private _readonlyNeedsFolds = true
  private _selectionDragPointer: { x: number; y: number } | null = null
  private _selectionDragScrollAccumulator = 0
  private _selectionDragAnchor: number | null = null
  private _selectionDragDirection: -1 | 1 = 1
  private _readonlyKeyboardSelectionAnchor: number | null = null
  private _displayedTextLength = 0

  constructor(ctx: RenderContext, options: CodeEditorOptions) {
    super(ctx, {
      id: options.id,
      initialValue: options.value ?? options.initialValue,
      backgroundColor: options.backgroundColor ?? "transparent",
      textColor: options.textColor ?? "#FFFFFF",
      focusedBackgroundColor: options.focusedBackgroundColor ?? "transparent",
      focusedTextColor: options.focusedTextColor ?? "#FFFFFF",
      cursorColor: options.cursorColor ?? "#FFFFFF",
      scrollMargin: options.scrollMargin,
      showCursor: options.readOnly ? true : undefined,
      flexGrow: options.flexGrow,
      flexShrink: options.flexShrink,
      flexBasis: options.flexBasis,
      minHeight: options.minHeight,
    })
    this._readOnly = options.readOnly ?? false
    this._filetype = options.filetype
    this._theme = options.theme
    this._displayedTextLength = (
      options.value ??
      options.initialValue ??
      ""
    ).length
    this._debounceMs = options.debounceMs ?? 200
    this._onSourceChange = options.onSourceChange
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
      options.value ?? options.initialValue ?? "",
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
        applyDisplayHighlights: (text) => {
          if (!this._readOnly) this._highlights.apply(text, this._filetype)
        },
        scheduleHighlight: () => this.scheduleHighlight(),
        requestRender: () => this.requestRender(),
        onSourceTextChange: (content) => {
          if (!this._readOnly) this._validation.refresh(content)
        },
        onFoldsChange: () => this._onFoldsChange?.(),
      },
    )
    if (!this._readOnly) this._validation.refresh(this._foldManager.sourceText)

    this.editBuffer.on("content-changed", () => {
      if (this.isDestroyed || this._suppressContentChanged) return
      if (this._readOnly) return
      if (this._foldManager.isFoldedDisplay) return
      const content = super.plainText
      if (this._foldManager.sourceText === content) return
      this._foldManager.setSourceText(content)
      this.scheduleHighlight()
      this._onSourceChange?.()
    })

    if (this._foldManager.sourceText.length > 0) {
      if (this._readOnly) this.scheduleHighlight()
      else {
        this._highlights.apply(this._foldManager.sourceText, this._filetype)
        this.scheduleHighlight()
      }
    }

    this.onLifecyclePass = () => {
      if (this._readOnly) this.scheduleHighlight()
    }
  }
  get filetype(): string {
    return this._filetype
  }
  override getSelectedText(): string {
    const selectedText = super.getSelectedText()
    if (!selectedText || !this._foldManager.isFoldedDisplay) return selectedText

    const selection = this.getSelection()
    if (!selection) return selectedText
    const start = this.editBuffer.offsetToPosition(selection.start)
    return start
      ? this._foldManager.getSelectedSourceText(start.row, selectedText)
      : selectedText
  }
  override get plainText(): string {
    return this._foldManager.sourceText
  }
  override get height(): number {
    const height = super.height
    return Math.min(height, this.parent?.height ?? height)
  }
  get value(): string {
    return this.plainText
  }
  set value(value: string) {
    if (this.plainText === value) return
    this._foldManager.setSourceText(value)
    this._foldManager.clearFolds()
    this._readonlyNeedsFolds = true
    this.setDisplayedText(value)
    if (!this._readOnly) this._highlights.apply(value, this._filetype)
    this.scheduleHighlight()
  }
  get readOnly(): boolean {
    return this._readOnly
  }
  set readOnly(value: boolean) {
    const next = Boolean(value)
    if (next === this._readOnly) return
    this.clearReadonlyHighlights()
    this._readOnly = next
    this._readonlyNeedsFolds = true
    if (next) {
      this._displayedTextLength = super.plainText.length
      this.scheduleHighlight()
    } else {
      this._validation.refresh(this.plainText)
      this._highlights.apply(this.plainText, this._filetype)
      this.scheduleHighlight()
    }
  }
  set filetype(value: string) {
    if (this._filetype === value) return
    this._filetype = value
    if (this._readOnly) this.clearReadonlyHighlights()
    else this._highlights.clear()
    if (!this._readOnly) this._validation.setFiletype(value, this.plainText)
    this._readonlyNeedsFolds = true
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
  get onSourceChange(): (() => void) | undefined {
    return this._onSourceChange
  }
  set onSourceChange(value: (() => void) | undefined) {
    this._onSourceChange = value
  }
  get extraHighlights(): ((content: string) => Highlight[]) | undefined {
    return this._highlights.extra
  }
  set extraHighlights(value: ((content: string) => Highlight[]) | undefined) {
    this._highlights.setExtra(value)
    if (this._readOnly) {
      this.clearReadonlyHighlights()
      this.scheduleHighlight()
      return
    }
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
  get onFoldsChange(): (() => void) | undefined {
    return this._onFoldsChange
  }
  set onFoldsChange(value: (() => void) | undefined) {
    this._onFoldsChange = value
  }
  getFolds() {
    return this._foldManager.getFolds()
  }

  getFoldSigns() {
    return this._foldManager.getFoldSigns()
  }

  getDisplayLineNumbers() {
    return this._foldManager.getDisplayLineNumbers()
  }

  get totalVirtualLineCount(): number {
    return this.editorView.getTotalVirtualLineCount()
  }

  get viewport() {
    const viewport = this.editorView.getViewport()
    return {
      ...viewport,
      height: Math.min(viewport.height, this.height),
    }
  }

  getHiddenLineNumbers() {
    return this._foldManager.getHiddenLineNumbers()
  }

  set theme(value: Theme) {
    this._theme = value
    this._highlights.setTheme(value)
    this.clearReadonlyHighlights()
    if (this._readOnly) {
      this.scheduleHighlight()
      return
    }
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

  refreshHighlights(): Promise<void> {
    if (this._readOnly) {
      if (this._readonlyHighlightTimer) {
        clearTimeout(this._readonlyHighlightTimer)
        this._readonlyHighlightTimer = null
      }
      return this.highlightReadonly()
    }
    if (this._highlightTimer) {
      clearTimeout(this._highlightTimer)
      this._highlightTimer = null
    }
    return this.highlight()
  }

  toggleFold(line: number): void {
    this._foldManager.toggleFold(line)
    if (this._readOnly || this._filetype === "xml") this.scheduleHighlight()
  }

  foldAll(): void {
    this._foldManager.foldAll()
    if (this._readOnly || this._filetype === "xml") this.scheduleHighlight()
  }

  unfoldAll(): void {
    this._foldManager.unfoldAll()
    if (this._readOnly || this._filetype === "xml") this.scheduleHighlight()
  }

  scrollByViewport(delta: number): void {
    this.scrollBy(delta * this.height)
  }

  scrollTo(position: number): void {
    const selection = this.getSelection()
    const viewport = this.viewport
    const maxPosition = Math.max(
      0,
      this.totalVirtualLineCount - viewport.height,
    )
    const nextPosition = Math.max(0, Math.min(position, maxPosition))
    this.editorView.setViewport(
      viewport.offsetX,
      nextPosition,
      viewport.width,
      viewport.height,
      false,
    )
    // Keep the viewport anchored without moving the edit cursor.
    const anchorRow = Math.min(1, Math.max(0, viewport.height - 1))
    this.editorView.setLocalSelection(
      0,
      anchorRow,
      0,
      anchorRow,
      undefined,
      undefined,
      false,
      false,
    )
    if (selection) {
      this.editorView.setSelection(selection.start, selection.end)
    }
    this.requestRender()
    if (this._readOnly) this.scheduleHighlight()
  }

  scrollBy(delta: number): void {
    if (delta === 0) return
    const move =
      delta < 0 ? this.moveCursorUp.bind(this) : this.moveCursorDown.bind(this)
    for (
      let step = 0;
      step < Math.max(1, Math.round(Math.abs(delta)));
      step++
    ) {
      move()
    }
    if (this._readOnly) this.scheduleHighlight()
  }

  handleSelectionDrag(x: number, y: number): void {
    const selection = this._ctx.getSelection()
    if (!selection?.isDragging) return
    if (this._selectionDragAnchor === null) {
      const editorSelection = this.getSelection()
      if (editorSelection) {
        this._selectionDragDirection =
          y < selection.anchor.y ||
          (y === selection.anchor.y && x < selection.anchor.x)
            ? -1
            : 1
        this._selectionDragAnchor =
          this._selectionDragDirection === 1
            ? editorSelection.start
            : editorSelection.end
      }
    }
    this._selectionDragPointer = { x, y }
    this.refreshSelectionDrag()
    const direction = y < this.y ? -1 : y >= this.y + this.height ? 1 : 0
    if (direction !== 0) this.scrollSelectionDrag(direction, 1)
  }

  finishSelectionDrag(): void {
    this._selectionDragPointer = null
    this._selectionDragScrollAccumulator = 0
    this._selectionDragAnchor = null
  }

  protected override onUpdate(deltaTime: number): void {
    super.onUpdate(deltaTime)
    this.refreshSelectionDrag(deltaTime)
  }

  override requestRender(): void {
    if (this._renderSuppressed || this.isDestroyed) return
    super.requestRender()
    this.emit("scroll-change")
  }

  override handlePaste(event: PasteEvent): void {
    if (this._readOnly) return
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
    if (this._readOnly) {
      const isSelectionNavigation =
        key.shift &&
        ["left", "right", "up", "down", "home", "end"].includes(key.name)
      if (isSelectionNavigation) {
        if (this._readonlyKeyboardSelectionAnchor === null) {
          this._readonlyKeyboardSelectionAnchor = this.cursorOffset
        }
        const handled = super.handleKeyPress(key)
        if (handled) {
          this.editorView.setSelection(
            this._readonlyKeyboardSelectionAnchor,
            this.cursorOffset,
          )
          this.requestRender()
        }
        return handled
      }
      this._readonlyKeyboardSelectionAnchor = null
      if (key.name === "pagedown") {
        this.scrollByViewport(1)
        return true
      }
      if (key.name === "pageup") {
        this.scrollByViewport(-1)
        return true
      }
      if (key.name === "home" && !key.shift) {
        this.scrollTo(0)
        return true
      }
      if (key.name === "end" && !key.shift) {
        this.scrollTo(this.totalVirtualLineCount)
        return true
      }
      if (
        !key.ctrl &&
        !key.meta &&
        !key.option &&
        !key.super &&
        !key.hyper &&
        ["left", "right", "up", "down", "home", "end"].includes(key.name)
      ) {
        return super.handleKeyPress(key)
      }
      return false
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
      this._onSourceChange?.()
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
    if (this._readonlyHighlightTimer) clearTimeout(this._readonlyHighlightTimer)
    super.destroy()
  }

  private refreshSelectionDrag(deltaTime = 0): void {
    const pointer = this._selectionDragPointer
    if (!pointer) return
    if (!this._ctx.getSelection()?.isDragging || this.height <= 0) {
      this.finishSelectionDrag()
      return
    }
    const direction =
      pointer.y < this.y ? -1 : pointer.y >= this.y + this.height ? 1 : 0
    if (direction !== 0 && deltaTime > 0) {
      this._selectionDragScrollAccumulator += (deltaTime * 12) / 1000
      const linesToScroll = Math.floor(this._selectionDragScrollAccumulator)
      if (linesToScroll > 0) {
        this._selectionDragScrollAccumulator -= linesToScroll
        if (!this.scrollSelectionDrag(direction, linesToScroll))
          this._selectionDragScrollAccumulator = 0
      }
    }
    this._ctx.updateSelection(
      this,
      pointer.x,
      Math.max(this.y, Math.min(pointer.y, this.y + this.height - 1)),
    )
    this.restoreSelectionDragAnchor()
  }

  private scrollSelectionDrag(direction: -1 | 1, lines: number): boolean {
    const viewport = this.editorView.getViewport()
    const maxOffset = Math.max(0, this.totalVirtualLineCount - viewport.height)
    const nextOffset = Math.max(
      0,
      Math.min(viewport.offsetY + direction * lines, maxOffset),
    )
    if (nextOffset === viewport.offsetY) return false
    this.editorView.setViewport(
      viewport.offsetX,
      nextOffset,
      viewport.width,
      viewport.height,
      false,
    )
    this.requestRender()
    if (this._readOnly) this.scheduleHighlight()
    return true
  }

  private restoreSelectionDragAnchor(): void {
    if (this._selectionDragAnchor === null) return
    const selection = this.getSelection()
    if (!selection) return
    const focus =
      this._selectionDragDirection === 1 ? selection.end : selection.start
    this.editorView.setSelection(
      Math.min(this._selectionDragAnchor, focus),
      Math.max(this._selectionDragAnchor, focus),
    )
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
      this._displayedTextLength = text.length
      this.yogaNode.markDirty()
      this.clearReadonlyHighlights()
    } finally {
      this._suppressContentChanged = false
    }
  }

  private scheduleHighlight(): void {
    if (this._readOnly) {
      if (this._readonlyHighlightTimer) return
      this._readonlyHighlightTimer = setTimeout(() => {
        this._readonlyHighlightTimer = null
        void this.highlightReadonly()
      }, 0)
      return
    }
    this._highlightSnapshotId++
    if (this._highlightTimer) clearTimeout(this._highlightTimer)
    this._highlightTimer = setTimeout(() => {
      this._highlightTimer = null
      this.highlight()
    }, this._debounceMs)
  }

  private async highlight(): Promise<void> {
    const snapshotId = ++this._highlightSnapshotId
    const foldedXml =
      this._filetype === "xml" && this._foldManager.isFoldedDisplay
    const content = foldedXml ? super.plainText : this.plainText
    if (content.length === 0 || content.length > 100_000) {
      this._highlights.clear()
      this._foldManager.clearFolds()
      return
    }
    if (this._foldManager.isFoldedDisplay && !foldedXml) return

    await this._highlights.highlight(
      content,
      this._filetype,
      this._tsClient,
      () =>
        snapshotId === this._highlightSnapshotId &&
        !this.isDestroyed &&
        this._foldManager.isFoldedDisplay === foldedXml,
    )
    if (
      snapshotId !== this._highlightSnapshotId ||
      this.isDestroyed ||
      this._foldManager.isFoldedDisplay !== foldedXml
    )
      return
    if (foldedXml) return
    this.computeFoldRanges()
  }

  private async highlightReadonly(): Promise<void> {
    if (this.isDestroyed) return
    if (this._readonlyNeedsFolds) {
      this._readonlyNeedsFolds = false
      this.computeFoldRanges()
    }
    if (this._filetype === "xml") {
      await this.highlightReadonlyTreeSitter()
      return
    }
    if (this._filetype !== "json") return
    const viewportStart = Math.max(0, this.scrollY - 2)
    const viewportEnd = Math.min(
      this.lineInfo.lineSources.length,
      this.scrollY + this.viewport.height + 2,
    )
    const lines: number[] = []
    for (
      let displayLine = viewportStart;
      displayLine < viewportEnd;
      displayLine++
    ) {
      const line = this.lineInfo.lineSources[displayLine]
      if (line === undefined) continue
      if (this._readonlyHighlightedLines.has(line)) continue
      this._readonlyHighlightedLines.add(line)
      lines.push(line)
    }
    if (lines.length === 0) return

    this._highlights.prepare()
    for (const line of lines) {
      const start = this.editBuffer.getLineStartOffset(line)
      const end =
        line + 1 < this.editBuffer.getLineCount()
          ? this.editBuffer.getLineStartOffset(line + 1) - 1
          : this._displayedTextLength
      const text = this.editBuffer.getTextRange(start, end)
      if (text.length > 100_000) continue
      for (const token of highlightJsonTokens(text, this._theme)) {
        this.addHighlight(line, {
          start: token.displayOffset,
          end: token.displayEnd,
          styleId: this._highlights.jsonStyleId(token),
          priority: 1,
        })
      }
    }
    this.requestRender()
  }

  private highlightReadonlyTreeSitter(): Promise<void> {
    const content = super.plainText
    if (
      content === this._readonlyTreeSitterContent &&
      this._filetype === this._readonlyTreeSitterFiletype
    )
      return this._readonlyTreeSitterHighlight ?? Promise.resolve()

    this._readonlyTreeSitterContent = content
    this._readonlyTreeSitterFiletype = this._filetype
    const snapshotId = ++this._highlightSnapshotId
    if (content.length === 0 || content.length > 100_000) {
      this.clearAllHighlights()
      return Promise.resolve()
    }

    const highlight = this._highlights
      .highlight(content, this._filetype, this._tsClient, () => {
        return (
          snapshotId === this._highlightSnapshotId &&
          !this.isDestroyed &&
          content === super.plainText
        )
      })
      .then(() => {
        if (snapshotId === this._highlightSnapshotId && !this.isDestroyed) {
          this.requestRender()
        }
      })
      .finally(() => {
        if (this._readonlyTreeSitterHighlight === highlight) {
          this._readonlyTreeSitterHighlight = null
        }
      })
    this._readonlyTreeSitterHighlight = highlight
    return highlight
  }

  private clearReadonlyHighlights(): void {
    this._highlightSnapshotId++
    this._readonlyHighlightedLines.clear()
    this._readonlyTreeSitterContent = null
    this._readonlyTreeSitterFiletype = null
    this.clearAllHighlights()
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

export class CodeEditorScrollBarRenderable extends ScrollBarRenderable {
  private _target: CodeEditorRenderable | null = null
  private readonly _targetRef: { current: CodeEditorRenderable | null }
  private readonly _syncTarget = () => this.syncTarget()
  private readonly _clearTarget = () => {
    this.target = null
  }

  constructor(
    ctx: RenderContext,
    { target, ...options }: CodeEditorScrollBarOptions,
  ) {
    const targetRef = { current: target }
    super(ctx, {
      ...options,
      orientation: "vertical",
      onChange: (position) => targetRef.current?.scrollTo(position),
    })
    this._targetRef = targetRef
    this.target = target
    this.onLifecyclePass = () => this.syncTarget()
  }

  set target(target: CodeEditorRenderable | null) {
    if (target === this._target) return
    this._target?.off("line-info-change", this._syncTarget)
    this._target?.off("scroll-change", this._syncTarget)
    this._target?.off("destroyed", this._clearTarget)
    this._target = target
    this._targetRef.current = target
    target?.on("line-info-change", this._syncTarget)
    target?.on("scroll-change", this._syncTarget)
    target?.on("destroyed", this._clearTarget)
    this.syncTarget()
  }

  private syncTarget(): void {
    if (!this._target) return
    this.scrollSize = this._target.totalVirtualLineCount
    this.viewportSize = this._target.viewport.height
    this.scrollPosition = this._target.scrollY
  }

  override destroy(): void {
    this.target = null
    super.destroy()
  }
}
