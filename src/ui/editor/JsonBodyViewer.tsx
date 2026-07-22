import { extend } from "@opentui/react"
import {
  TextBufferRenderable,
  type RenderContext,
  type RenderableOptions,
  type SyntaxStyle,
} from "@opentui/core"
import type { RefObject } from "react"
import type { ScrollBoxRenderable } from "@opentui/core"
import type { Environment } from "../../schema"
import type { Theme } from "../theme-data"
import { createJsonSyntaxStyle } from "./useJsonHighlight"
import { highlightJsonTokens } from "./syntax"

const HIGHLIGHT_BATCH_SIZE = 128

interface HighlightJob {
  start: number
  end: number
  styleId: number
  priority: number
}

function styleIdForToken(
  kind: ReturnType<typeof highlightJsonTokens>[number]["kind"],
  style: SyntaxStyle,
): number {
  const styleName =
    kind === "key"
      ? "json.key"
      : kind === "string"
        ? "json.string"
        : kind === "number"
          ? "json.number"
          : kind === "boolean"
            ? "json.boolean"
            : kind === "null"
              ? "json.null"
              : kind === "bracket"
                ? "json.bracket"
                : "json.text"
  return style.getStyleId(styleName) ?? 0
}

function displayOffsetWithin(text: string, offset: number): number {
  let displayOffset = 0
  for (let index = 0; index < offset;) {
    const codePoint = text.codePointAt(index)
    if (codePoint === undefined) break
    index += codePoint > 0xffff ? 2 : 1
    if (codePoint !== 0x0a && codePoint !== 0x0d) displayOffset++
  }
  return displayOffset
}

export interface JsonBodyOptions extends RenderableOptions<JsonBodyRenderable> {
  body: string
  theme: Theme
  activeEnv?: Environment | null
  backgroundColor?: string
  highlightPriority?: "start" | "end"
}

export class JsonBodyRenderable extends TextBufferRenderable {
  private _body: string
  private _theme: Theme
  private _activeEnv?: Environment | null
  private _backgroundColor?: string
  private _syntaxStyle: SyntaxStyle
  private _highlightGeneration = 0
  private _highlightTimer: ReturnType<typeof setTimeout> | null = null
  private _highlightJobs: HighlightJob[] = []
  private _highlightedJobs = new Uint8Array(0)
  private _highlightCursor = 0
  private _highlightDirection = 1
  private _highlightPriority: "start" | "end"

  constructor(ctx: RenderContext, options: JsonBodyOptions) {
    super(ctx, {
      fg: options.theme.text,
      bg: options.backgroundColor ?? options.theme.backgroundPanel,
      wrapMode: "char",
      selectable: true,
    })
    this._body = options.body
    this._theme = options.theme
    this._activeEnv = options.activeEnv
    this._backgroundColor = options.backgroundColor
    this._highlightPriority = options.highlightPriority ?? "start"
    this._syntaxStyle = createJsonSyntaxStyle(options.theme)
    this.textBuffer.setSyntaxStyle(this._syntaxStyle)
    this.renderBody()
  }

  set body(value: string) {
    if (this._body === value) return
    this._body = value
    this.renderBody()
  }

  set theme(value: Theme) {
    if (this._theme === value) return
    this._theme = value
    this.textBuffer.setSyntaxStyle(null)
    this._syntaxStyle.destroy()
    this._syntaxStyle = createJsonSyntaxStyle(value)
    this.textBuffer.setSyntaxStyle(this._syntaxStyle)
    this.fg = value.text
    this.bg = this._backgroundColor ?? value.backgroundPanel
    this.renderBody()
  }

  set activeEnv(value: Environment | null | undefined) {
    if (this._activeEnv === value) return
    this._activeEnv = value
    this.renderBody()
  }

  set backgroundColor(value: string | undefined) {
    if (this._backgroundColor === value) return
    this._backgroundColor = value
    this.bg = value ?? this._theme.backgroundPanel
  }

  set highlightPriority(value: "start" | "end" | undefined) {
    const next = value ?? "start"
    if (this._highlightPriority === next) return
    this._highlightPriority = next
    this.restartHighlights()
  }

  private renderBody() {
    this._highlightGeneration++
    if (this._highlightTimer) clearTimeout(this._highlightTimer)
    this._highlightTimer = null
    this.textBuffer.setText(this._body)
    this.textBuffer.clearAllHighlights()
    this.updateTextInfo()
    this._highlightJobs = this.buildHighlightJobs()
    this._highlightedJobs = new Uint8Array(this._highlightJobs.length)
    this.resetHighlightCursor()
    this.scheduleHighlights(this._highlightGeneration)
  }

  private restartHighlights() {
    if (this._highlightJobs.length === 0) return
    this._highlightGeneration++
    if (this._highlightTimer) clearTimeout(this._highlightTimer)
    this._highlightTimer = null
    this.resetHighlightCursor()
    this.scheduleHighlights(this._highlightGeneration)
  }

  private resetHighlightCursor() {
    this._highlightDirection = this._highlightPriority === "end" ? -1 : 1
    this._highlightCursor =
      this._highlightPriority === "end" ? this._highlightJobs.length - 1 : 0
  }

  private buildHighlightJobs(): HighlightJob[] {
    const tokens = highlightJsonTokens(this._body, this._theme)
    const jobs = tokens.map((token) => ({
      start: token.displayOffset,
      end: token.displayEnd,
      styleId: styleIdForToken(token.kind, this._syntaxStyle),
      priority: 1,
    }))

    if (!this._activeEnv) return jobs

    const varRe = /\$\w+/g
    let tokenIndex = 0
    let match: RegExpExecArray | null
    while ((match = varRe.exec(this._body)) !== null) {
      while (
        tokenIndex < tokens.length &&
        tokens[tokenIndex]!.offset + tokens[tokenIndex]!.text.length <=
          match.index
      ) {
        tokenIndex++
      }
      const token = tokens[tokenIndex]
      if (
        !token ||
        match.index + match[0].length > token.offset + token.text.length
      ) {
        continue
      }
      const start =
        token.displayOffset +
        displayOffsetWithin(token.text, match.index - token.offset)
      jobs.push({
        start,
        end: start + match[0].length,
        styleId:
          this._syntaxStyle.getStyleId(
            Object.hasOwn(this._activeEnv.vars, match[0].slice(1))
              ? "env.resolved"
              : "env.missing",
          ) ?? 0,
        priority: 2,
      })
    }
    return jobs
  }

  private scheduleHighlights(generation: number) {
    const applyBatch = () => {
      if (this.isDestroyed || generation !== this._highlightGeneration) return
      let applied = 0
      while (
        this._highlightCursor >= 0 &&
        this._highlightCursor < this._highlightJobs.length &&
        applied < HIGHLIGHT_BATCH_SIZE
      ) {
        const index = this._highlightCursor
        this._highlightCursor += this._highlightDirection
        if (this._highlightedJobs[index] === 1) continue
        this.textBuffer.addHighlightByCharRange(this._highlightJobs[index]!)
        this._highlightedJobs[index] = 1
        applied++
      }
      if (applied > 0) this.requestRender()
      if (
        this._highlightCursor >= 0 &&
        this._highlightCursor < this._highlightJobs.length
      ) {
        this._highlightTimer = setTimeout(applyBatch, 0)
      } else {
        this._highlightTimer = null
      }
    }
    applyBatch()
  }

  override destroy() {
    this._highlightGeneration++
    if (this._highlightTimer) clearTimeout(this._highlightTimer)
    this._highlightTimer = null
    if (!this.isDestroyed) {
      this.textBuffer.setSyntaxStyle(null)
      this._syntaxStyle.destroy()
    }
    super.destroy()
  }
}

extend({ "json-body": JsonBodyRenderable })

export function JsonBodyViewer({
  body,
  theme,
  activeEnv,
  backgroundColor,
  highlightPriority,
}: {
  body: string
  theme: Theme
  id?: string
  readOnly?: boolean
  activeEnv?: Environment | null
  backgroundColor?: string
  highlightPriority?: "start" | "end"
  focused?: boolean
  scrollRef?: RefObject<ScrollBoxRenderable | null>
}) {
  const bg = backgroundColor ?? theme.backgroundPanel

  return (
    <line-number
      minWidth={3}
      paddingRight={1}
      fg={theme.textMuted}
      bg={bg}
      style={{ flexGrow: 1 }}
      width="100%"
    >
      <json-body
        body={body}
        theme={theme}
        activeEnv={activeEnv}
        backgroundColor={backgroundColor}
        highlightPriority={highlightPriority}
        style={{ flexGrow: 1 }}
      />
    </line-number>
  )
}
