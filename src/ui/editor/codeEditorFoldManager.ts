import {
  buildFoldDisplay,
  buildSourceDisplayMaps,
  computeFoldRanges,
  hasFoldedRanges,
  isSourceLineHiddenByFold,
  type FoldInfo,
  type SourceCursor,
} from "./codeEditorFolds"

export interface CodeEditorFoldManagerHost {
  getDisplayedText: () => string
  setDisplayedText: (text: string) => void
  getCursor: () => SourceCursor
  setCursor: (line: number, col: number) => void
  withRenderSuppressed: (action: () => void) => void
  applyDisplayHighlights: (text: string) => void
  scheduleHighlight: () => void
  requestRender: () => void
  onSourceTextChange: (content: string) => void
  onFoldsChange: () => void
}

export class CodeEditorFoldManager {
  private _foldable: boolean
  private _folds = new Map<number, FoldInfo>()
  private _sourceText: string
  private _filetype: string
  private _displayMode: "source" | "folded" = "source"
  private _sourceLineToDisplayLine = new Map<number, number>()
  private _displayLineToSourceLine = new Map<number, number>()

  constructor(
    sourceText: string,
    filetype: string,
    foldable: boolean,
    private readonly host: CodeEditorFoldManagerHost,
  ) {
    this._sourceText = sourceText
    this._filetype = filetype
    this._foldable = foldable
    this.rebuildSourceDisplayMaps()
  }

  get sourceText(): string {
    return this._sourceText
  }

  get foldable(): boolean {
    return this._foldable
  }

  get isFoldedDisplay(): boolean {
    return this._displayMode === "folded"
  }

  getFolds(): Map<number, FoldInfo> {
    return new Map(this._folds)
  }

  getFoldSigns(): Map<number, { before: string; beforeColor: string }> {
    const signs = new Map<number, { before: string; beforeColor: string }>()
    for (const [line, fold] of this._folds) {
      if (isSourceLineHiddenByFold(line, this._folds)) continue
      const displayLine = this.isFoldedDisplay
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
    if (this.isFoldedDisplay) return new Set()
    const hidden = new Set<number>()
    for (const fold of this._folds.values()) {
      if (!fold.folded) continue
      for (let line = fold.startLine + 1; line <= fold.endLine; line++) {
        hidden.add(line)
      }
    }
    return hidden
  }

  setSourceText(content: string): void {
    this._sourceText = content
    this._displayMode = "source"
    this.rebuildSourceDisplayMaps()
    this.host.onSourceTextChange(content)
  }

  setFiletype(filetype: string): void {
    this._filetype = filetype
    this.computeFoldRanges()
  }

  setFoldable(foldable: boolean): void {
    this._foldable = foldable
    this._folds.clear()
    this.restoreSourceDisplay()
    this.host.requestRender()
  }

  toggleFold(displayLine: number): void {
    const sourceLine = this.displayLineToSourceLine(displayLine)
    const fold = this._folds.get(sourceLine)
    if (!fold) return
    fold.folded = !fold.folded
    this._folds.set(fold.startLine, fold)
    this.applyFoldDisplay(sourceLine)
    this.host.onFoldsChange()
  }

  foldAll(): void {
    let changed = false
    for (const fold of this._folds.values()) {
      if (fold.folded) continue
      fold.folded = true
      changed = true
    }
    if (!changed) return
    this.applyFoldDisplay()
    this.host.onFoldsChange()
  }

  unfoldAll(): void {
    const sourceCursor = this.isFoldedDisplay
      ? this.getSourceCursorFromDisplay()
      : undefined
    let changed = false
    for (const fold of this._folds.values()) {
      if (!fold.folded) continue
      fold.folded = false
      changed = true
    }
    if (!changed) return
    this.restoreSourceDisplay(undefined, sourceCursor)
    this.host.onFoldsChange()
  }

  hasFoldedRanges(): boolean {
    return hasFoldedRanges(this._folds)
  }

  displayLineToSourceLine(displayLine: number): number {
    if (!this.isFoldedDisplay) return displayLine
    return this._displayLineToSourceLine.get(displayLine) ?? displayLine
  }

  isFoldedSummaryLine(sourceLine: number): boolean {
    return this._folds.get(sourceLine)?.folded ?? false
  }

  getSourceCursorFromDisplay(): SourceCursor {
    const cursor = this.host.getCursor()
    return { line: this.displayLineToSourceLine(cursor.line), col: cursor.col }
  }

  restoreSourceDisplay(
    preferredSourceLine?: number,
    preferredSourceCursor?: SourceCursor,
  ): void {
    this.host.withRenderSuppressed(() => {
      const wasFolded = this.isFoldedDisplay
      this._displayMode = "source"
      this.rebuildSourceDisplayMaps()
      if (wasFolded || this.host.getDisplayedText() !== this._sourceText) {
        this.setDisplayedText(this._sourceText)
        this.host.applyDisplayHighlights(this._sourceText)
      }
      if (wasFolded) this.host.scheduleHighlight()
      if (preferredSourceCursor)
        this.moveCursorToSourceCursor(preferredSourceCursor)
      else this.moveCursorToSourceLine(preferredSourceLine)
    })
  }

  syncFoldDisplayAfterEdit(): void {
    const sourceCursor = this.getSourceCursorFromDisplay()
    this.syncSourceTextFromDisplayedBuffer()
    this.computeFoldRanges()
    this.applyFoldDisplay(sourceCursor)
    this.host.scheduleHighlight()
  }

  computeFoldRanges(): void {
    if (!this._foldable) return
    this._folds = computeFoldRanges(
      this._sourceText,
      this._filetype,
      this._folds,
    )
    const folded = this.hasFoldedRanges()
    if (folded) this.applyFoldDisplay()
    this.host.onFoldsChange()
    if (!folded) this.host.requestRender()
  }

  clearFolds(): boolean {
    if (this._folds.size === 0) return false
    this._folds.clear()
    this.host.onFoldsChange()
    this.host.requestRender()
    return true
  }

  private applyFoldDisplay(preferred?: number | SourceCursor): void {
    this.host.withRenderSuppressed(() => {
      if (!this.hasFoldedRanges()) {
        if (typeof preferred === "object")
          this.restoreSourceDisplay(undefined, preferred)
        else this.restoreSourceDisplay(preferred)
        return
      }
      const display = buildFoldDisplay(this._sourceText, this._folds)
      this._displayMode = "folded"
      this._sourceLineToDisplayLine = display.sourceLineToDisplayLine
      this._displayLineToSourceLine = display.displayLineToSourceLine
      this.setDisplayedText(display.text)
      this.host.applyDisplayHighlights(display.text)
      if (typeof preferred === "object")
        this.moveCursorToSourceCursor(preferred)
      else this.moveCursorToSourceLine(preferred)
    })
  }

  private setDisplayedText(text: string): void {
    this.host.setDisplayedText(text)
  }

  private syncSourceTextFromDisplayedBuffer(): void {
    this._sourceText = this.host.getDisplayedText()
    this.rebuildSourceDisplayMaps()
    this.host.onSourceTextChange(this._sourceText)
  }

  private rebuildSourceDisplayMaps(): void {
    const maps = buildSourceDisplayMaps(this._sourceText)
    this._sourceLineToDisplayLine = maps.sourceLineToDisplayLine
    this._displayLineToSourceLine = maps.displayLineToSourceLine
  }

  private moveCursorToSourceLine(sourceLine?: number): void {
    if (sourceLine === undefined) return
    const displayLine = this._sourceLineToDisplayLine.get(sourceLine)
    if (displayLine !== undefined) this.host.setCursor(displayLine, 0)
  }

  private moveCursorToSourceCursor(sourceCursor: SourceCursor): void {
    const displayLine = this._sourceLineToDisplayLine.get(sourceCursor.line)
    if (displayLine === undefined) return
    const line = this._sourceText.split("\n")[sourceCursor.line] ?? ""
    this.host.setCursor(displayLine, Math.min(sourceCursor.col, line.length))
  }
}
