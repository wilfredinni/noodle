import { useEffect, useState } from "react"
import { extend, useRenderer } from "@opentui/react"
import {
  ImageRenderable,
  RGBA,
  type ImageRenderableOptions,
  type OptimizedBuffer,
  type Renderable,
  type RenderContext,
} from "@opentui/core"
import { useKeymap } from "@opentui/keymap/react"
import type { Response } from "../schema"
import {
  responseByteSize,
  responseContentType,
  responseImageFormat,
  suggestedResponseFilename,
} from "../responseBody"
import { ActionButton } from "./ActionButton"
import { formatSize } from "./format"
import { useTheme } from "./theme"
import {
  ModalImageComposition,
  mountedModalBackdrop,
  mountedModalBackdrops,
  RESPONSE_IMAGE_ID,
} from "./modalImageComposition"

interface ResponseImageOptions extends ImageRenderableOptions {
  modalRoot?: Renderable
  paneBackground?: string
}

// PNG pixel decoding may be lazy: handle failures during painting as well as loading.
export class ResponseImageRenderable extends ImageRenderable {
  private failed = false
  private composition = new ModalImageComposition()
  modalRoot?: Renderable
  paneBackground: string
  constructor(ctx: RenderContext, options: ResponseImageOptions) {
    super(ctx, options)
    this.modalRoot = options.modalRoot
    this.paneBackground = options.paneBackground ?? "#000000"
  }
  private previewFailed(error: unknown) {
    this.composition.dispose()
    this.failed = true
    this.onError?.(error)
  }
  override render(buffer: OptimizedBuffer, deltaTime: number): void {
    // OpenTUI clamps exposed dimensions to one cell, even for zero Yoga space.
    if (
      this.failed ||
      this.yogaNode.getComputedWidth() <= 0 ||
      this.yogaNode.getComputedHeight() <= 0
    )
      return
    try {
      super.render(buffer, deltaTime)
    } catch (error) {
      this.previewFailed(error)
    }
  }
  protected override renderSelf(buffer: OptimizedBuffer): void {
    if (this.modalRoot && mountedModalBackdrop(this.modalRoot)) return
    this.composition.dispose()
    super.renderSelf(buffer)
  }
  paintUnderModal(buffer: OptimizedBuffer) {
    if (
      this.failed ||
      !this.visible ||
      this.isDestroyed ||
      !this.image ||
      !this.modalRoot ||
      this.yogaNode.getComputedWidth() <= 0 ||
      this.yogaNode.getComputedHeight() <= 0
    )
      return
    for (let ancestor = this.parent; ancestor; ancestor = ancestor.parent) {
      if (!ancestor.visible) {
        this.composition.dispose()
        return
      }
    }
    const backdrops = mountedModalBackdrops(this.modalRoot)
    if (backdrops.length === 0 || this.width <= 0 || this.height <= 0) return
    try {
      const fitted = this.getFittedSize(this.width, this.height)
      const resolution =
        this.ctx.resolution &&
        this.ctx.resolution.width > 0 &&
        this.ctx.resolution.height > 0
          ? this.ctx.resolution
          : null
      const pixelWidth =
        resolution && this.ctx.terminalWidth
          ? Math.max(
              1,
              Math.round(
                (fitted.width * resolution.width) / this.ctx.terminalWidth,
              ),
            )
          : 0
      const pixelHeight =
        resolution && this.ctx.terminalHeight
          ? Math.max(
              1,
              Math.round(
                (fitted.height * resolution.height) / this.ctx.terminalHeight,
              ),
            )
          : 0
      this.composition.paint(
        buffer,
        this.image,
        {
          x: this.screenX + Math.floor((this.width - fitted.width) / 2),
          y: this.screenY + Math.floor((this.height - fitted.height) / 2),
          ...fitted,
        },
        RGBA.fromHex(this.paneBackground),
        this.modalRoot,
        backdrops,
        this.effectiveProtocol,
        pixelWidth,
        pixelHeight,
      )
    } catch (error) {
      this.previewFailed(error)
    }
  }
  protected override destroySelf(): void {
    this.composition.dispose()
    super.destroySelf()
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
  const renderer = useRenderer()
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
          id={RESPONSE_IMAGE_ID}
          modalRoot={renderer.root}
          paneBackground={theme.backgroundPanel}
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
          style={{
            flexGrow: 1,
            flexBasis: 0,
            minHeight: 0,
            minWidth: 0,
            marginTop: 1,
            marginBottom: 1,
          }}
        />
      )}
    </box>
  )
}
