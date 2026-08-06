export interface FoldInfo {
  startLine: number
  endLine: number
  startOffset: number
  endOffset: number
  summary: string
  folded: boolean
}

export interface SourceCursor {
  line: number
  col: number
}

export interface FoldDisplay {
  text: string
  sourceLineToDisplayLine: Map<number, number>
  displayLineToSourceLine: Map<number, number>
}

export function computeFoldRanges(
  content: string,
  filetype: string,
  previousFolds: ReadonlyMap<number, FoldInfo>,
): Map<number, FoldInfo> {
  const folds = new Map<number, FoldInfo>()

  if (filetype === "json") {
    computeJsonFoldRanges(content, folds, previousFolds)
  } else if (filetype === "yaml") {
    computeYamlFoldRanges(content, folds, previousFolds)
  }

  return folds
}

export function buildFoldDisplay(
  sourceText: string,
  folds: ReadonlyMap<number, FoldInfo>,
): FoldDisplay {
  const lines = sourceText.split("\n")
  const displayLines: string[] = []
  const sourceLineToDisplayLine = new Map<number, number>()
  const displayLineToSourceLine = new Map<number, number>()

  for (let sourceLine = 0; sourceLine < lines.length;) {
    const displayLine = displayLines.length
    const fold = folds.get(sourceLine)

    if (fold?.folded) {
      sourceLineToDisplayLine.set(sourceLine, displayLine)
      displayLineToSourceLine.set(displayLine, sourceLine)
      displayLines.push(`${getLineIndent(lines[sourceLine])}${fold.summary}`)
      sourceLine = fold.endLine + 1
      continue
    }

    sourceLineToDisplayLine.set(sourceLine, displayLine)
    displayLineToSourceLine.set(displayLine, sourceLine)
    displayLines.push(lines[sourceLine])
    sourceLine++
  }

  return {
    text: displayLines.join("\n"),
    sourceLineToDisplayLine,
    displayLineToSourceLine,
  }
}

export function buildSourceDisplayMaps(content: string): {
  sourceLineToDisplayLine: Map<number, number>
  displayLineToSourceLine: Map<number, number>
} {
  const sourceLineToDisplayLine = new Map<number, number>()
  const displayLineToSourceLine = new Map<number, number>()

  const lineCount = content.split("\n").length
  for (let line = 0; line < lineCount; line++) {
    sourceLineToDisplayLine.set(line, line)
    displayLineToSourceLine.set(line, line)
  }

  return { sourceLineToDisplayLine, displayLineToSourceLine }
}

export function hasFoldedRanges(folds: ReadonlyMap<number, FoldInfo>): boolean {
  return Array.from(folds.values()).some((fold) => fold.folded)
}

export function isSourceLineHiddenByFold(
  line: number,
  folds: ReadonlyMap<number, FoldInfo>,
): boolean {
  return Array.from(folds.values()).some(
    (fold) => fold.folded && line > fold.startLine && line <= fold.endLine,
  )
}

function computeJsonFoldRanges(
  content: string,
  folds: Map<number, FoldInfo>,
  previousFolds: ReadonlyMap<number, FoldInfo>,
): void {
  const lines = content.split("\n")
  const stack: { char: string; line: number; offset: number }[] = []
  let lineOffset = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    for (let j = 0; j < line.length; j++) {
      const char = line[j]
      if (char === '"') {
        j++
        while (j < line.length) {
          if (line[j] === "\\") j++
          else if (line[j] === '"') break
          j++
        }
        continue
      }

      if (char === "{" || char === "[") {
        stack.push({
          char,
          line: i,
          offset: lineOffset + j,
        })
        continue
      }

      if (char !== "}" && char !== "]") continue
      const expected = char === "}" ? "{" : "["
      for (let k = stack.length - 1; k >= 0; k--) {
        if (stack[k].char !== expected) continue
        const start = stack[k]
        if (start.line < i) {
          folds.set(start.line, {
            startLine: start.line,
            endLine: i,
            startOffset: start.offset,
            endOffset: lineOffset + j,
            summary: getJsonFoldSummary(lines, start.line, i, start.char),
            folded: previousFolds.get(start.line)?.folded ?? false,
          })
        }
        stack.length = k
        break
      }
    }
    lineOffset += line.length + 1
  }
}

function computeYamlFoldRanges(
  content: string,
  folds: Map<number, FoldInfo>,
  previousFolds: ReadonlyMap<number, FoldInfo>,
): void {
  const lines = content.split("\n")
  const lineOffsets: number[] = []
  let offset = 0
  for (const line of lines) {
    lineOffsets.push(offset)
    offset += line.length + 1
  }

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
      if (nextIndent > indent) endLine = j
      else break
    }

    if (endLine <= i) continue
    folds.set(i, {
      startLine: i,
      endLine,
      startOffset: lineOffsets[i]!,
      endOffset: lineOffsets[endLine]! + (lines[endLine]?.length ?? 0),
      summary: lines[i].trim().slice(0, 40),
      folded: previousFolds.get(i)?.folded ?? false,
    })
    i = endLine
  }
}

function getJsonFoldSummary(
  lines: string[],
  startLine: number,
  endLine: number,
  openingChar: string,
): string {
  const bracket = openingChar === "{" ? "}" : "]"
  return `${lines[startLine].trim().slice(0, 30)}... ${bracket} (${endLine - startLine} lines)`
}

function getLineIndent(line: string): string {
  return /^\s*/.exec(line)?.[0] ?? ""
}
