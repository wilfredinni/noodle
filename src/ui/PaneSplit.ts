import {
  BoxRenderable,
  type BoxOptions,
  type RenderContext,
} from "@opentui/core"
import { extend } from "@opentui/react"

interface PaneSplitOptions extends BoxOptions {
  splitRatio?: number
  panesExpanded?: boolean
}

export class PaneSplitRenderable extends BoxRenderable {
  private ratio: number
  private expanded: boolean

  constructor(ctx: RenderContext, options: PaneSplitOptions) {
    super(ctx, options)
    this.ratio = options.splitRatio ?? 0.5
    this.expanded = options.panesExpanded ?? false
  }

  set splitRatio(value: number) {
    this.ratio = value
    this.requestRender()
  }

  set panesExpanded(value: boolean) {
    this.expanded = value
    this.requestRender()
  }

  override onLifecyclePass = (): void => {
    if (this.expanded) return
    const request = this.getChildren().find(
      (child) => child.id === "request-pane-slot",
    )
    const response = this.getChildren().find(
      (child) => child.id === "response-pane-slot",
    )
    if (!request || !response) return
    // Size panes in whole cells before Yoga runs, so footers cannot round onto borders.
    if (this.primaryAxis === "column" && this.height > 0) {
      const height = Math.round(this.height * this.ratio)
      request.height = height
      response.height = this.height - height
    } else if (this.primaryAxis === "row" && this.width > 0) {
      const available = Math.max(0, this.width - 1)
      const width = Math.round(available * this.ratio)
      request.width = width
      response.width = available - width
    }
    // Numeric dimensions disable shrinking in OpenTUI; retain the pane minima behavior.
    if (request.flexShrink !== 1) request.flexShrink = 1
    if (response.flexShrink !== 1) response.flexShrink = 1
  }
}

extend({ "pane-split": PaneSplitRenderable })

declare module "@opentui/react" {
  interface OpenTUIComponents {
    "pane-split": typeof PaneSplitRenderable
  }
}
