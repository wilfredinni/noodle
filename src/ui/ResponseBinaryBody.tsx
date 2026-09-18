import { useContext, useEffect, useState } from "react"
import { extend } from "@opentui/react"
import { ImageRenderable, type OptimizedBuffer } from "@opentui/core"
import { useKeymap } from "@opentui/keymap/react"
import type { Response } from "../schema"
import {
  responseByteSize,
  responseContentType,
  responseImageFormat,
  suggestedResponseFilename,
} from "../responseBody"
import { ResponseFileContext } from "./responseFileContext"
import { ActionButton } from "./ActionButton"
import { formatSize } from "./format"
import { useTheme } from "./theme"

// PNG pixel decoding may be lazy: handle failures during painting as well as loading.
export class ResponseImageRenderable extends ImageRenderable {
  private failed = false
  override render(buffer: OptimizedBuffer, deltaTime: number): void {
    if (this.failed) return
    try {
      super.render(buffer, deltaTime)
    } catch (error) {
      this.failed = true
      this.onError?.(error)
    }
  }
}
extend({ "response-image": ResponseImageRenderable })
declare module "@opentui/react" {
  interface OpenTUIComponents {
    "response-image": typeof ResponseImageRenderable
  }
}

export function ResponseBinaryBody({
  response,
  requestName,
  focused,
}: {
  response: Response
  requestName: string
  focused: boolean
}) {
  const theme = useTheme()
  const actions = useContext(ResponseFileContext)
  const keymap = useKeymap()
  const [activated, setActivated] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bytes = response.bodyBytes
  const size = responseByteSize(response)
  const contentType = responseContentType(response.headers)
  const previewable = Boolean(
    bytes &&
    (responseImageFormat(bytes) ||
      /^image\/(png|jpeg|webp|gif)$/.test(contentType)),
  )
  const large = size > 5 * 1024 * 1024
  useEffect(() => {
    if (!focused) return
    return keymap.intercept(
      "key",
      (ctx) => {
        const overlay = keymap.getData("app.overlay")
        if (overlay && overlay !== "none") return
        if (ctx.event.name === "v" && previewable && large && !activated) {
          ctx.event.preventDefault()
          ctx.event.stopPropagation()
          setActivated(true)
        }
      },
      { priority: 100 },
    )
  }, [keymap, focused, previewable, large, activated])

  return (
    <box
      style={{
        flexDirection: "column",
        flexGrow: 1,
        minHeight: 0,
        overflow: "hidden",
      }}
    >
      <text fg={theme.text} wrapMode="word">
        {suggestedResponseFilename(response, requestName)}
      </text>
      <text
        fg={theme.textMuted}
        wrapMode="word"
      >{`${contentType} · ${formatSize(size)}`}</text>
      {!previewable ? (
        <text fg={theme.textMuted}>Preview unavailable for this format.</text>
      ) : error ? (
        <text
          fg={theme.warning}
          wrapMode="word"
        >{`Preview unavailable: ${error}`}</text>
      ) : large && !activated ? (
        <ActionButton
          shortcut="v"
          label="preview image"
          onAction={() => setActivated(true)}
        />
      ) : (
        <response-image
          id="binary-response-image"
          source={bytes}
          fit="fit"
          protocol="auto"
          onError={(reason) =>
            setError(
              reason instanceof Error
                ? reason.message
                : "Image could not be decoded",
            )
          }
          style={{ flexGrow: 1, flexBasis: 0, minHeight: 0, minWidth: 0 }}
        />
      )}
      <box style={{ flexDirection: "row", flexShrink: 0 }}>
        <ActionButton
          label="Save file"
          disabled={!actions || !bytes}
          onAction={() => actions?.save()}
        />
        <ActionButton
          label="Open in default app"
          disabled={!actions?.savedPath}
          onAction={() => actions?.open()}
        />
      </box>
      {actions?.savedPath ? (
        <text fg={theme.textMuted} wrapMode="word">
          {actions.savedPath}
        </text>
      ) : null}
    </box>
  )
}
