import type { SyntaxStyle } from "@opentui/core"
import {
  buildCharToDisplayOffsets,
  charOffsetToDisplayOffset,
} from "../variable-completion/highlightOffsets"
import type { EditorHighlightRange } from "./codeEditorHighlighting"

// A lexical fallback only; QuickJS owns syntax validation.
export function javascriptTokens(source: string) {
  const pattern =
    /\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$)|"(?:\\[\s\S]|[^"\\])*(?:"|$)|'(?:\\[\s\S]|[^'\\])*(?:'|$)|`(?:\\[\s\S]|[^`\\])*(?:`|$)|\b(?:const|let|var|if|else|for|while|return|throw|try|catch|finally|function|class|new|async|await|typeof|instanceof|switch|case|break|continue|yield|delete|void|in|of)\b|\b(?:true|false|null|undefined)\b|\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/g
  return [...source.matchAll(pattern)].map((match) => ({
    start: match.index,
    end: match.index + match[0].length,
    kind: match[0].startsWith("/")
      ? "comment"
      : /^["'`]/.test(match[0])
        ? "string"
        : /^\d/.test(match[0])
          ? "number"
          : /^(true|false|null|undefined)$/.test(match[0])
            ? "constant.builtin"
            : "keyword",
  }))
}

export function buildJavascriptHighlightRanges(
  source: string,
  style: SyntaxStyle,
): EditorHighlightRange[] {
  const offsets = buildCharToDisplayOffsets(source)
  return javascriptTokens(source).map((token) => ({
    start: charOffsetToDisplayOffset(offsets, token.start),
    end: charOffsetToDisplayOffset(offsets, token.end),
    styleId: style.getStyleId(token.kind) ?? 0,
    priority: 1,
  }))
}
