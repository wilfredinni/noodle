import { useEffect, useMemo, useRef, useState } from "react"
import { useKeyboard } from "@opentui/react"
import type { ScrollBoxRenderable } from "@opentui/core"
import type { Collection, Request } from "../../schema"
import { CODE_LANGUAGES, generateCode, type CodeLanguage } from "../../codegen"
import { copyToClipboard } from "../clipboard"
import { useRenderer } from "../RendererContext"
import { showToast } from "../Toast"
import { useTheme } from "../theme"
import { Overlay } from "./Overlay"
import { Select, type SelectItem } from "../Select"
import { highlightGeneratedCode } from "./codeSyntax"

const LANGUAGE_ITEMS: SelectItem[] = [
  { id: "curl", label: "cURL", description: "Shell command" },
  { id: "httpie", label: "HTTPie", description: "HTTPie command" },
  { id: "wget", label: "Wget", description: "Wget command" },
  { id: "javascript", label: "JavaScript", description: "Fetch API" },
  { id: "python", label: "Python", description: "requests" },
  { id: "go", label: "Go", description: "net/http" },
]

export function CodeGeneratorOverlay({
  visible,
  request,
  collection,
  onClose,
}: {
  visible: boolean
  request: Request
  collection?: Collection
  onClose: () => void
}) {
  const theme = useTheme()
  const renderer = useRenderer()
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)
  const [language, setLanguage] = useState<CodeLanguage>("curl")
  const [languageSelectOpen, setLanguageSelectOpen] = useState(false)

  useEffect(() => {
    if (visible) setLanguage("curl")
  }, [visible, request.id])

  const result = useMemo(() => {
    try {
      return {
        generated: generateCode(request, language, collection),
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
  }, [request, language, collection])

  const highlightedCode = useMemo(
    () =>
      result.generated
        ? highlightGeneratedCode(result.generated.code, theme)
        : [],
    [result.generated, theme],
  )
  const lineNumberWidth = String(Math.max(1, highlightedCode.length)).length

  useKeyboard((key) => {
    if (!visible) return
    if (key.name === "escape") onClose()
    else if (key.name === "c" && !key.ctrl && result.generated) {
      if (copyToClipboard(result.generated.code, renderer))
        showToast("Generated code copied", "success")
      else showToast("Failed to copy generated code", "error")
    } else if (key.name === "up") scrollRef.current?.scrollBy(-1)
    else if (key.name === "down") scrollRef.current?.scrollBy(1)
    else if (key.name === "pageup") scrollRef.current?.scrollBy(-1, "viewport")
    else if (key.name === "pagedown") scrollRef.current?.scrollBy(1, "viewport")
  })

  if (!visible) return null

  return (
    <Overlay
      visible
      width={90}
      height="80%"
      gap={1}
      padding={1}
      overflow="visible"
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
        style={{ zIndex: languageSelectOpen ? 1 : undefined }}
      >
        <Select
          items={LANGUAGE_ITEMS}
          value={language}
          onChange={(value) => {
            if ((CODE_LANGUAGES as readonly string[]).includes(value))
              setLanguage(value as CodeLanguage)
          }}
          onOpenChange={setLanguageSelectOpen}
          focused
          width={28}
        />
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
        <>
          {result.generated?.warnings.length ? (
            <box
              border={["left"]}
              borderColor={theme.warning}
              style={{
                flexDirection: "column",
                marginLeft: 4,
                marginRight: 4,
                paddingLeft: 1,
              }}
            >
              <text fg={theme.warning}>Conversion warnings</text>
              {result.generated.warnings.map((warning) => (
                <text key={warning} fg={theme.textMuted}>
                  • {warning}
                </text>
              ))}
            </box>
          ) : null}
          <scrollbox
            ref={scrollRef}
            scrollY
            paddingLeft={4}
            paddingRight={4}
            style={{ flexGrow: 1, minHeight: 0 }}
            scrollbarOptions={{ visible: false }}
          >
            <box style={{ flexDirection: "column" }}>
              {highlightedCode.map((line, index) => (
                <box key={index} style={{ flexDirection: "row" }}>
                  <text fg={theme.textMuted} wrapMode="none">
                    {String(index + 1).padStart(lineNumberWidth, " ")}{" "}
                  </text>
                  {line.map((span, spanIndex) => (
                    <text key={spanIndex} fg={span.fg} wrapMode="char">
                      {span.text}
                    </text>
                  ))}
                </box>
              ))}
            </box>
          </scrollbox>
        </>
      )}
      <box
        style={{
          flexDirection: "row",
          flexShrink: 0,
        }}
      >
        <box
          style={{
            flexDirection: "row",
            justifyContent: "flex-end",
            paddingX: 2,
            flexGrow: 1,
            gap: 1,
          }}
        >
          <text fg={theme.text}>c</text>
          <text fg={theme.textMuted}>copy</text>
          <text fg={theme.textMuted}> · </text>
          <text fg={theme.text}>esc</text>
          <text fg={theme.textMuted}>close</text>
        </box>
      </box>
    </Overlay>
  )
}
