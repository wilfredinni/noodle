import { useEffect, useMemo, useRef, useState } from "react"
import { useKeymap } from "@opentui/keymap/react"
import type { ScrollBoxRenderable } from "@opentui/core"
import type { Collection, Environment, Request } from "../../schema"
import { generateCode, getCodeTarget } from "../../codegen"
import { CODE_LANGUAGES } from "../../codegen/targets"
import { copyToClipboard } from "../clipboard"
import { useRenderer } from "../RendererContext"
import { showToast } from "../Toast"
import { useTheme } from "../theme"
import { Overlay } from "./Overlay"
import { Select, type SelectItem } from "../Select"
import { highlightGeneratedCode } from "./codeSyntax"

const LANG_ITEMS: SelectItem[] = CODE_LANGUAGES.map((l) => ({
  id: l.key,
  label: l.title,
}))

function buildClientItems(languageKey: string): SelectItem[] {
  const lang = CODE_LANGUAGES.find((l) => l.key === languageKey)
  if (!lang || lang.clients.length <= 1) return []
  return lang.clients.map((c) => ({
    id: c.id,
    label: c.title,
  }))
}

const DEFAULT_LANG = CODE_LANGUAGES[0]!

export function CodeGeneratorOverlay({
  visible,
  request,
  collection,
  env,
  envName,
  onClose,
}: {
  visible: boolean
  request: Request
  collection?: Collection
  env?: Environment
  envName?: string
  onClose: () => void
}) {
  const theme = useTheme()
  const renderer = useRenderer()
  const keymap = useKeymap()
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)
  const [languageKey, setLanguageKey] = useState(DEFAULT_LANG.key)
  const [clientId, setClientId] = useState(DEFAULT_LANG.defaultClientId)
  const [focus, setFocus] = useState<"language" | "library">("language")
  const [interpolate, setInterpolate] = useState(false)

  const clientItems = buildClientItems(languageKey)
  const hasClients = clientItems.length > 0

  const target = getCodeTarget(languageKey, clientId)

  useEffect(() => {
    if (visible) {
      setLanguageKey(DEFAULT_LANG.key)
      setClientId(DEFAULT_LANG.defaultClientId)
      setFocus("language")
      setInterpolate(false)
    }
  }, [visible, request.id])

  const result = useMemo(() => {
    if (!target) return { generated: null, error: "Unknown target" }
    try {
      return {
        generated: generateCode(request, target, collection, env, interpolate),
        error: null,
      }
    } catch (e) {
      return {
        generated: null,
        error:
          e instanceof Error
            ? e.message.replace(/^codegen\.generateCode: /, "")
            : String(e),
      }
    }
  }, [request, target, collection, env, interpolate])

  const highlightedCode = useMemo(
    () =>
      result.generated
        ? highlightGeneratedCode(result.generated.code, theme, target?.target)
        : [],
    [result.generated, theme],
  )
  const lineNumberWidth = String(Math.max(1, highlightedCode.length)).length

  useEffect(() => {
    if (!visible) return
    const dispose = keymap.intercept(
      "key",
      (ctx) => {
        const key = ctx.event
        key.preventDefault()
        key.stopPropagation()

        if (key.name === "escape") onClose()
        else if (key.name === "tab") {
          setFocus(
            !hasClients
              ? "language"
              : key.shift
                ? focus === "library"
                  ? "language"
                  : "library"
                : focus === "language"
                  ? "library"
                  : "language",
          )
        } else if (key.name === "i" && !key.ctrl) {
          if (env) setInterpolate((prev) => !prev)
        } else if (key.name === "c" && !key.ctrl && result.generated) {
          if (copyToClipboard(result.generated.code, renderer))
            showToast("Generated code copied", "success")
          else showToast("Failed to copy generated code", "error")
        } else if (key.name === "up") scrollRef.current?.scrollBy(-1)
        else if (key.name === "down") scrollRef.current?.scrollBy(1)
        else if (key.name === "pageup")
          scrollRef.current?.scrollBy(-1, "viewport")
        else if (key.name === "pagedown")
          scrollRef.current?.scrollBy(1, "viewport")
      },
      { priority: 100 },
    )
    return dispose
  }, [
    visible,
    keymap,
    onClose,
    hasClients,
    focus,
    env,
    result.generated,
    renderer,
  ])

  if (!visible) return null

  return (
    <Overlay
      visible
      width={90}
      height="80%"
      gap={1}
      padding={1}
      overflow="hidden"
    >
      <box
        paddingLeft={4}
        paddingRight={4}
        style={{ flexDirection: "row", alignItems: "center" }}
      >
        <text fg={theme.text}>Generate code</text>
        <box style={{ flexGrow: 1 }} />
        <text fg={theme.textMuted}>esc</text>
      </box>
      <box
        paddingLeft={4}
        paddingRight={4}
        style={{ flexDirection: "row", gap: 1 }}
      >
        <Select
          items={LANG_ITEMS}
          value={languageKey}
          onChange={(value) => {
            const lang = CODE_LANGUAGES.find((l) => l.key === value)
            if (!lang) return
            setLanguageKey(value)
            setClientId(lang.defaultClientId)
          }}
          focused={focus === "language"}
          triggerPriority={110}
          width={22}
        />
        {hasClients && (
          <Select
            items={clientItems}
            value={clientId}
            onChange={(value) => {
              setClientId(value)
            }}
            focused={focus === "library"}
            triggerPriority={110}
            width={24}
          />
        )}
      </box>
      {result.error ? (
        <box
          border={["left"]}
          borderColor={theme.error}
          style={{ marginLeft: 4, marginRight: 4, paddingLeft: 1 }}
        >
          <text fg={theme.error}>{result.error}</text>
        </box>
      ) : (
        <scrollbox
          ref={scrollRef}
          scrollY
          paddingLeft={4}
          paddingRight={4}
          style={{
            flexGrow: 1,
            flexShrink: 1,
            flexBasis: 0,
            height: 0,
            minHeight: 0,
          }}
          scrollbarOptions={{ visible: false }}
        >
          <box style={{ flexDirection: "column" }}>
            {highlightedCode.map((line, index) => (
              <box key={index} style={{ flexDirection: "row" }}>
                <text
                  fg={theme.textMuted}
                  wrapMode="none"
                  style={{ minWidth: lineNumberWidth + 2 }}
                >
                  {String(index + 1).padStart(lineNumberWidth, " ")}
                </text>
                <text
                  content={line}
                  wrapMode="word"
                  style={{ flexShrink: 1, minWidth: 10 }}
                />
              </box>
            ))}
          </box>
        </scrollbox>
      )}
      <box
        paddingBottom={1}
        style={{
          flexDirection: "row",
          flexShrink: 0,
        }}
      >
        <box paddingLeft={2} style={{ flexDirection: "row" }}>
          {envName ? <text fg={theme.textMuted}>env:{envName}</text> : null}
        </box>
        <box
          style={{
            flexDirection: "row",
            justifyContent: "flex-end",
            paddingX: 2,
            flexGrow: 1,
          }}
        >
          <text fg={theme.text}>i</text>
          <text
            fg={
              !env
                ? theme.border
                : interpolate
                  ? theme.primary
                  : theme.textMuted
            }
          >
            {" "}
            interpolate{!env ? " (no env)" : ""}{" "}
          </text>
          <text fg={theme.textMuted}>· </text>
          <text fg={theme.text}>c</text>
          <text fg={theme.textMuted}> copy </text>
          <text fg={theme.textMuted}>· </text>
          <text fg={theme.text}>esc</text>
          <text fg={theme.textMuted}> close</text>
        </box>
      </box>
    </Overlay>
  )
}
