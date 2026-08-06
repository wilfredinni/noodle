import type { LineNumberRenderable, LineSign } from "@opentui/core"
import type { CodeEditorRenderable } from "./CodeEditor"

const LINE_NUMBER_MIN_WIDTH = 4
const LINE_NUMBER_PADDING_RIGHT = 1
const FOLD_SIGN_WIDTH = 1

export const RESERVED_FOLD_SIGN = new Map<number, LineSign>([
  [-1, { before: " " }],
])

interface GutterWithWidth {
  gutter?: { width: number }
}

export function syncCodeEditorGutter(
  lineNumber: LineNumberRenderable,
  editor: CodeEditorRenderable,
  hoveredFoldLine?: number,
  foldSignColor?: string,
): void {
  const signs = editor.getFoldSigns()
  const sign =
    hoveredFoldLine === undefined ? undefined : signs.get(hoveredFoldLine)
  if (sign && foldSignColor && hoveredFoldLine !== undefined) {
    signs.set(hoveredFoldLine, { ...sign, beforeColor: foldSignColor })
  }

  const lineNumbers = editor.getDisplayLineNumbers()
  lineNumber.setLineSigns(new Map([...RESERVED_FOLD_SIGN, ...signs]))
  lineNumber.setLineNumbers(lineNumbers)
  lineNumber.setHideLineNumbers(editor.getHiddenLineNumbers())

  // OpenTUI normally lets the gutter's auto measurement grow inside a flexed
  // line-number container. Fix its width to the sign plus number columns so
  // extra source-line digits grow toward the editor instead of separating the
  // fold sign from its number.
  const maxLineNumber = Math.max(editor.lineCount, ...lineNumbers.values())
  const digits = String(Math.max(1, maxLineNumber)).length
  const numberWidth = Math.max(
    LINE_NUMBER_MIN_WIDTH,
    digits + LINE_NUMBER_PADDING_RIGHT + 1,
  )
  const gutter = (lineNumber as unknown as GutterWithWidth).gutter
  if (gutter) gutter.width = FOLD_SIGN_WIDTH + numberWidth
}
