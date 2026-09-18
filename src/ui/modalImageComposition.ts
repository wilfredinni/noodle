import {
  BoxRenderable,
  NativeImage,
  RGBA,
  type OptimizedBuffer,
  type Renderable,
  type ImageRenderProtocol,
} from "@opentui/core"

export const MODAL_BACKDROP_ID = "modal-image-backdrop"
export const RESPONSE_IMAGE_ID = "binary-response-image"

export type ImageRect = {
  x: number
  y: number
  width: number
  height: number
}

function intersect(a: ImageRect, b: ImageRect): ImageRect | null {
  const x = Math.max(a.x, b.x)
  const y = Math.max(a.y, b.y)
  const right = Math.min(a.x + a.width, b.x + b.width)
  const bottom = Math.min(a.y + a.height, b.y + b.height)
  return right > x && bottom > y
    ? { x, y, width: right - x, height: bottom - y }
    : null
}

function outside(rect: ImageRect, occluder: ImageRect): ImageRect[] {
  const covered = intersect(rect, occluder)
  if (!covered) return [rect]
  return [
    { x: rect.x, y: rect.y, width: rect.width, height: covered.y - rect.y },
    {
      x: rect.x,
      y: covered.y + covered.height,
      width: rect.width,
      height: rect.y + rect.height - covered.y - covered.height,
    },
    {
      x: rect.x,
      y: covered.y,
      width: covered.x - rect.x,
      height: covered.height,
    },
    {
      x: covered.x + covered.width,
      y: covered.y,
      width: rect.x + rect.width - covered.x - covered.width,
      height: covered.height,
    },
  ].filter((part) => part.width > 0 && part.height > 0)
}

function bounds(node: Renderable): ImageRect {
  return {
    x: node.screenX,
    y: node.screenY,
    width: node.width,
    height: node.height,
  }
}

export function mountedModalBackdrops(root: Renderable): BoxRenderable[] {
  return root
    .getChildren()
    .filter(
      (node): node is BoxRenderable =>
        node instanceof BoxRenderable &&
        node.id.startsWith(`${MODAL_BACKDROP_ID}:`) &&
        node.visible &&
        !node.isDestroyed,
    )
    .sort((a, b) => a.zIndex - b.zIndex)
}

export function mountedModalBackdrop(root: Renderable): BoxRenderable | null {
  return mountedModalBackdrops(root).at(-1) ?? null
}

// Inspect the laid-out portal tree, including separately portalled completions.
// Native placements are physically cropped, independent of terminal z ordering.
function opaquePortalBounds(
  root: Renderable,
  backdrop: BoxRenderable,
): ImageRect[] {
  const result: ImageRect[] = []
  function visit(node: Renderable, clip: ImageRect) {
    if (!node.visible || node.isDestroyed) return
    const rect = bounds(node)
    const visible = intersect(rect, clip)
    if (
      visible &&
      node instanceof BoxRenderable &&
      node.shouldFill &&
      node.backgroundColor.a === 1
    ) {
      result.push(visible)
    }
    const childClip = node.overflow === "hidden" ? visible : clip
    if (childClip) {
      for (const child of node.getChildren()) visit(child, childClip)
    }
  }
  for (const portal of root.getChildren()) {
    if (portal.zIndex >= backdrop.zIndex) visit(portal, bounds(root))
  }
  return result.filter(
    (rect, index) =>
      !result.some(
        (other, otherIndex) =>
          otherIndex !== index &&
          other.x <= rect.x &&
          other.y <= rect.y &&
          other.x + other.width >= rect.x + rect.width &&
          other.y + other.height >= rect.y + rect.height &&
          (other.width * other.height > rect.width * rect.height ||
            otherIndex < index),
      ),
  )
}

type Fragment = { rect: ImageRect; image: NativeImage }

export class ModalImageComposition {
  private original: NativeImage | null = null
  private key = ""
  private dimmed: NativeImage | null = null
  private fragments: Fragment[] = []

  dispose() {
    for (const fragment of this.fragments) fragment.image.dispose()
    this.dimmed?.dispose()
    this.fragments = []
    this.dimmed = null
    this.original = null
    this.key = ""
  }

  paint(
    buffer: OptimizedBuffer,
    original: NativeImage,
    rect: ImageRect,
    background: RGBA,
    root: Renderable,
    backdrops: BoxRenderable[],
    protocol: Exclude<ImageRenderProtocol, "auto">,
    pixelWidth: number,
    pixelHeight: number,
  ) {
    const occluders = opaquePortalBounds(root, backdrops[0]!)
    const shades = backdrops.map((backdrop) =>
      backdrop.backgroundColor.toInts(),
    )
    const base = background.toInts()
    const key = JSON.stringify([
      rect,
      base,
      shades,
      protocol,
      pixelWidth,
      pixelHeight,
      occluders,
    ])
    if (this.original !== original || this.key !== key) {
      this.dispose()
      const visible = intersect(rect, bounds(root))
      let regions = visible ? [visible] : []
      for (const occluder of occluders) {
        regions = regions.flatMap((region) => outside(region, occluder))
      }
      if (regions.length === 0) {
        this.original = original
        this.key = key
        return
      }
      try {
        // Blocks have two samples per cell axis. Native protocols use the known
        // display pixels; Kitty keeps source resolution when geometry is absent.
        const targetWidth = protocol === "blocks" ? rect.width * 2 : pixelWidth
        const targetHeight =
          protocol === "blocks" ? rect.height * 2 : pixelHeight
        const scale =
          targetWidth > 0 && targetHeight > 0
            ? Math.min(
                1,
                targetWidth / original.width,
                targetHeight / original.height,
              )
            : 1
        let resized: NativeImage | null = null
        try {
          if (scale < 1) {
            resized = original.resize({
              width: Math.max(1, Math.round(original.width * scale)),
              height: Math.max(1, Math.round(original.height * scale)),
            })
          }
          const raw = (resized ?? original).raw("rgba8")
          // raw() returns a copy. Composite alpha first, then apply the same
          // scrim as the cells; neither the original handle nor bytes changes.
          for (let y = 0; y < raw.height; y++) {
            for (let x = 0; x < raw.width; x++) {
              const index = y * raw.stride + x * 4
              const alpha = raw.data[index + 3]! / 255
              for (let channel = 0; channel < 3; channel++) {
                const composited =
                  raw.data[index + channel]! * alpha +
                  base[channel]! * (1 - alpha)
                let dimmed = composited
                for (const shade of shades) {
                  const shadeAlpha = shade[3] / 255
                  dimmed = Math.round(
                    dimmed * (1 - shadeAlpha) + shade[channel]! * shadeAlpha,
                  )
                }
                raw.data[index + channel] = dimmed
              }
              raw.data[index + 3] = 255
            }
          }
          this.dimmed = NativeImage.fromRgba(
            raw.data,
            raw.width,
            raw.height,
            raw.stride,
          )
        } finally {
          resized?.dispose()
        }
        for (const region of regions) {
          const left = Math.floor(
            ((region.x - rect.x) * this.dimmed.width) / rect.width,
          )
          const top = Math.floor(
            ((region.y - rect.y) * this.dimmed.height) / rect.height,
          )
          const right = Math.ceil(
            ((region.x + region.width - rect.x) * this.dimmed.width) /
              rect.width,
          )
          const bottom = Math.ceil(
            ((region.y + region.height - rect.y) * this.dimmed.height) /
              rect.height,
          )
          const image = this.dimmed.extract({
            left,
            top,
            width: right - left,
            height: bottom - top,
          })
          this.fragments.push({ rect: region, image })
        }
        this.original = original
        this.key = key
      } catch (error) {
        this.dispose()
        throw new Error("Image modal composition failed", { cause: error })
      }
    }
    for (const fragment of this.fragments) {
      const part = fragment.rect
      buffer.drawImage(
        fragment.image,
        part.x,
        part.y,
        part.width,
        part.height,
        pixelWidth
          ? Math.max(1, Math.round((part.width * pixelWidth) / rect.width))
          : 0,
        pixelHeight
          ? Math.max(1, Math.round((part.height * pixelHeight) / rect.height))
          : 0,
        0,
        0,
        fragment.image.width,
        fragment.image.height,
        protocol,
      )
    }
  }
}

export function paintModalResponseImage(
  root: Renderable,
  buffer: OptimizedBuffer,
  backdrop: Renderable,
) {
  if (mountedModalBackdrop(root) !== backdrop) return
  const image = root.findDescendantById(RESPONSE_IMAGE_ID)
  if (
    image &&
    "paintUnderModal" in image &&
    typeof image.paintUnderModal === "function"
  ) {
    image.paintUnderModal(buffer)
  }
}
