import { useEffect, useMemo, useRef, useState } from "react"
import { useKeyboard } from "@opentui/react"
import type { ScrollBoxRenderable } from "@opentui/core"
import type { Collection, Environment, Request } from "../../schema"
import { generateCode, findCodeTarget } from "../../codegen"
import { CODE_TARGETS } from "../../codegen/targets"
import { copyToClipboard } from "../clipboard"
import { useRenderer } from "../RendererContext"
import { showToast } from "../Toast"
import { useTheme } from "../theme"
import { Overlay } from "./Overlay"
import { Select, type SelectItem } from "../Select"
import { highlightGeneratedCode } from "./codeSyntax"

const TARGET_ITEMS: SelectItem[] = CODE_TARGETS.map((t) => ({
  id: t.id,
  label: t.label,
}))

const DEFAULT_TARGET = CODE_TARGETS[0]!

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
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)
  const [targetId, setTargetId] = useState(DEFAULT_TARGET.id)
  const [interpolate, setInterpolate] = useState(false)
  const [selectOpen, setSelectOpen] = useState(false)

  const target = findCodeTarget(targetId) ?? DEFAULT_TARGET

  useEffect(() => {
    if (visible) {
      setTargetId(DEFAULT_TARGET.id)
      setInterpolate(false)
    }
  }, [visible, request.id])

  const result = useMemo(() => {
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
        ? highlightGeneratedCode(result.generated.code, theme)
        : [],
    [result.generated, theme],
  )
  const lineNumberWidth = String(Math.max(1, highlightedCode.length)).length

  useKeyboard((key) => {
    if (!visible) return
    if (key.name === "escape") onClose()
    else if (key.name === "i" && !key.ctrl) {
      setInterpolate((prev) => !prev)
    } else if (key.name === "c" && !key.ctrl && result.generated) {
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
      <box paddingLeft={4} paddingRight={4}>
        <Select
          items={TARGET_ITEMS}
          value={targetId}
          onChange={(value) => {
            if (findCodeTarget(value)) setTargetId(value)
          }}
          onOpenChange={setSelectOpen}
          focused
          width={32}
        />
      </box>
      {!selectOpen && result.error ? (
        <box
          border={["left"]}
          borderColor={theme.error}
          style={{ marginLeft: 4, marginRight: 4, paddingLeft: 1 }}
        >
          <text fg={theme.error}>{result.error}</text>
        </box>
      ) : null}
      {!selectOpen && !result.error ? (
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
      ) : null}
      {selectOpen ? <box style={{ flexGrow: 1 }} /> : null}
      <box
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
          <text fg={interpolate ? theme.primary : theme.textMuted}>
            {" "}
            interpolate{" "}
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
