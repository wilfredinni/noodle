import { describe, expect, it, spyOn } from "bun:test"
import {
  act,
  createRef,
  useCallback,
  useEffect,
  useState,
  type ComponentProps,
} from "react"
import { Writable } from "node:stream"
import { scheduler } from "node:timers/promises"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import * as os from "node:os"
import { join } from "node:path"
import { NativeImage, OptimizedBuffer, RGBA } from "@opentui/core"
import { MouseButtons, setRendererCapabilities } from "@opentui/core/testing"
import { KeymapProvider } from "@opentui/keymap/react"
import { createTestKeymap } from "@opentui/keymap/testing"
import { createTestRender } from "../testRender"
import {
  ResponseBinaryBody,
  ResponseImageRenderable,
} from "../../src/ui/ResponseBinaryBody"
import { Overlay } from "../../src/ui/overlays/Overlay"
import { CommandPaletteOverlay } from "../../src/ui/overlays/CommandPaletteOverlay"
import { HelpOverlay } from "../../src/ui/overlays/HelpOverlay"
import {
  SaveResponseOverlay,
  type SaveResponseOverlayHandle,
} from "../../src/ui/overlays/SaveResponseOverlay"
import { bindingDefaults } from "../../src/ui/keybind"
import { useModalKeyboardShield } from "../../src/ui/useModalKeyboardShield"
import { useSingleFieldFormOverlayIntercept } from "../../src/ui/intercepts/useFormOverlayIntercept"
import { VariableCompletionInterceptor } from "../../src/ui/variable-completion/variableCompletionInterceptor"
import { VarInput } from "../../src/ui/VarInput"
import { ThemeProvider, opencodeTheme, THEMES } from "../../src/ui/theme"
import {
  MODAL_BACKDROP_ID,
  mountedModalBackdrop,
} from "../../src/ui/modalImageComposition"

const testRender = createTestRender()
const pixels = new Uint8Array(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAQAAAACCAYAAAB/qH1jAAAAFUlEQVR4nGP4DwIMDA0MIPAfBNEEABumDvOjtyhRAAAAAElFTkSuQmCC",
    "base64",
  ),
)

type Placement = {
  image: NativeImage
  pixels: Uint8Array
  x: number
  y: number
  width: number
  height: number
  pixelWidth: number | undefined
  pixelHeight: number | undefined
}

function recordPlacements() {
  const placements: Placement[] = []
  const drawImage = OptimizedBuffer.prototype.drawImage
  const spy = spyOn(OptimizedBuffer.prototype, "drawImage").mockImplementation(
    function (this: OptimizedBuffer, image, x, y, width, height, ...args) {
      placements.push({
        image,
        pixels: image.raw().data.slice(),
        x,
        y,
        width,
        height,
        pixelWidth: args[0],
        pixelHeight: args[1],
      })
      return drawImage.call(this, image, x, y, width, height, ...args)
    },
  )
  return { placements, restore: () => spy.mockRestore() }
}

type ModalKind =
  | "panel"
  | "command-palette"
  | "help"
  | "save-response"
  | "variables"
async function mount(
  protocol: "blocks" | "kitty" | "sixel" = "blocks",
  kind: ModalKind = "panel",
  initial = pixels,
) {
  const raw = createTestKeymap()
  const saveRef = createRef<SaveResponseOverlayHandle>()
  const confirmed: string[] = []
  const output: string[] = []
  const stdout = Object.assign(
    new Writable({
      write(chunk, _encoding, done) {
        output.push(chunk.toString())
        done()
      },
    }),
    { columns: 80, rows: 30, isTTY: true },
  ) as NodeJS.WriteStream
  let modal!: (visible: boolean) => void
  let stack!: (visible: boolean) => void
  let resizeModal!: (size: { width: number; height: number }) => void
  let replace!: (bytes: Uint8Array) => void
  let showBody!: (visible: boolean) => void
  const height = kind === "panel" ? 30 : 45
  function Modals({
    visible,
    close,
    bytes,
    size,
  }: {
    visible: boolean
    close: () => void
    bytes: Uint8Array
    size: { width: number; height: number }
  }) {
    const [variable, setVariable] = useState("")
    useModalKeyboardShield(
      visible
        ? kind === "variables" || kind === "panel"
          ? "about"
          : kind
        : "none",
    )
    const form = useSingleFieldFormOverlayIntercept({
      visible: visible && kind === "save-response",
      handleRef: saveRef,
      onConfirm: (path) => confirmed.push(path),
      onCancel: close,
    })
    useEffect(() => {
      if (!visible || kind !== "help") return
      return raw.keymap.intercept(
        "key",
        (ctx) => {
          if (ctx.event.name === "escape") {
            ctx.event.preventDefault()
            ctx.event.stopPropagation()
            close()
          }
        },
        { priority: 100 },
      )
    }, [visible, close])
    if (!visible) return null
    if (kind === "command-palette")
      return (
        <CommandPaletteOverlay
          visible
          commands={[
            {
              id: "save",
              label: "Save image",
              section: "Response",
              run: () => true,
            },
          ]}
          onClose={close}
        />
      )
    if (kind === "help")
      return (
        <HelpOverlay visible keybinds={bindingDefaults()} onClose={close} />
      )
    if (kind === "save-response")
      return (
        <SaveResponseOverlay
          ref={saveRef}
          pending={{
            requestName: "Image",
            response: {
              status: 200,
              statusText: "OK",
              headers: { "content-type": "image/png" },
              body: "",
              bodyBytes: bytes,
              bodyKind: "binary",
              timeMs: 1,
            },
          }}
          onConfirm={form.confirm}
          onClose={close}
        />
      )
    return (
      <Overlay
        visible
        width={size.width}
        height={size.height}
        padding={1}
        onClose={close}
      >
        <text fg="#ffffff">MODAL</text>
        {kind === "variables" ? (
          <VarInput
            value={variable}
            env={{
              name: "test",
              vars: {
                TOKEN_ONE: "one",
                TOKEN_TWO: "two",
                TOKEN_THREE: "three",
                TOKEN_FOUR: "four",
                TOKEN_FIVE: "five",
              },
            }}
            isEditing
            isFocused
            onChange={setVariable}
          />
        ) : null}
      </Overlay>
    )
  }
  function Harness() {
    const [visible, setVisible] = useState(false)
    const [stacked, setStacked] = useState(false)
    const [size, setSize] = useState({ width: 12, height: 8 })
    const [bytes, setBytes] = useState<Uint8Array>(initial)
    const [body, setBody] = useState(true)
    const close = useCallback(() => setVisible(false), [])
    modal = setVisible
    stack = setStacked
    resizeModal = setSize
    replace = setBytes
    showBody = setBody
    return (
      <KeymapProvider
        keymap={
          raw.keymap as unknown as ComponentProps<
            typeof KeymapProvider
          >["keymap"]
        }
      >
        <ThemeProvider
          activeIndex={THEMES.indexOf(opencodeTheme)}
          previewIndex={null}
        >
          <box
            width="100%"
            height="100%"
            flexDirection="column"
            backgroundColor={opencodeTheme.backgroundPanel}
          >
            <VariableCompletionInterceptor />
            <text fg="#ffffff">BACKGROUND</text>
            {body ? (
              <ResponseBinaryBody
                key={bytes === initial ? "initial" : "replacement"}
                response={{
                  status: 200,
                  statusText: "OK",
                  headers: { "content-type": "image/png" },
                  body: "",
                  bodyBytes: bytes,
                  bodyKind: "binary",
                  timeMs: 1,
                }}
                requestName="Image"
                focused
              />
            ) : (
              <text>Headers</text>
            )}
            <Modals visible={visible} close={close} bytes={bytes} size={size} />
            <Overlay
              visible={stacked}
              width={20}
              height={6}
              padding={1}
              onClose={() => setStacked(false)}
            >
              <text fg="#ffffff">STACKED</text>
            </Overlay>
          </box>
        </ThemeProvider>
      </KeymapProvider>
    )
  }
  const setup = await act(async () =>
    testRender(<Harness />, {
      width: 80,
      height,
      stdout,
      bufferedOutput: "stdout",
      useThread: false,
    }),
  )
  setRendererCapabilities(setup.renderer, {
    kitty_graphics: protocol === "kitty",
    sixel: protocol === "sixel",
  })
  // Supply real cell-to-pixel geometry, so Sixel cannot fall back to blocks.
  Object.defineProperty(setup.renderer, "resolution", {
    configurable: true,
    value: { width: 800, height: height * 20 },
  })
  const image = () =>
    setup.renderer.root.findDescendantById(
      "binary-response-image",
    ) as ResponseImageRenderable
  await act(async () => {
    await image()?.loadPromise
    await setup.renderOnce()
  })
  const render = async () =>
    act(async () => {
      await image()?.loadPromise
      await scheduler.yield()
      await setup.renderOnce()
    })
  return {
    ...setup,
    modal,
    stack,
    image,
    output,
    resizeModal,
    replace,
    showBody,
    saveRef,
    confirmed,
    render,
    host: raw.host,
    keymap: raw.keymap,
  }
}

describe("images beneath modal backdrops", () => {
  it("applies every stacked modal scrim and paints only after the final backdrop", async () => {
    const setup = await mount("kitty")
    const original = setup.image().image!
    const { placements, restore } = recordPlacements()
    try {
      await act(async () => {
        setup.modal(true)
        setup.stack(true)
      })
      await setup.render()
      const buffer = setup.renderer.currentRenderBuffer
      expect(
        Array.from(buffer.buffers.fg.slice(0, 3), (value) => value & 255),
      ).toEqual([43, 43, 43])
      expect(placements.length).toBeGreaterThan(0)
      for (const placement of placements) {
        for (let index = 0; index < placement.pixels.length; index += 4) {
          expect(
            Math.max(...placement.pixels.slice(index, index + 3)),
          ).toBeLessThanOrEqual(43)
        }
      }
      const backdrops = setup.renderer.root
        .getChildren()
        .filter((node) => node.id.startsWith(MODAL_BACKDROP_ID))
      expect(backdrops).toHaveLength(2)
      expect(new Set(backdrops.map((node) => node.id)).size).toBe(2)
      expect(setup.image().image).toBe(original)
      placements.length = 0
      await act(async () => setup.stack(false))
      await setup.render()
      expect(placements.some((part) => part.pixels.includes(105))).toBe(true)
      await act(async () => setup.modal(false))
      await setup.render()
      expect(placements[placements.length - 1]!.image).toBe(original)
    } finally {
      restore()
    }
  })
  it.each(["blocks", "kitty", "sixel"] as const)(
    "keeps the image and background dimmed beneath an opaque modal using %s",
    async (protocol) => {
      const setup = await mount(protocol)
      const retained = setup.image()
      const original = retained.image!
      const originalPixels = original.raw().data.slice()
      const { placements, restore } = recordPlacements()
      try {
        setup.output.length = 0
        await act(async () => setup.modal(true))
        await act(async () => setup.renderOnce())
        await setup.renderer.idle()
        expect(retained.protocol).toBe("auto")
        expect(retained.effectiveProtocol).toBe(protocol)
        if (protocol === "kitty")
          expect(setup.output.join("")).toContain("\x1b_G")
        if (protocol === "sixel")
          expect(setup.output.join("")).toContain("\x1bP0;1;0q")
        const backdrop = setup.renderer.root
          .getChildren()
          .find((child) => child.zIndex === 10000)!
        const panel = backdrop.getChildren()[0]!
        const buffer = setup.renderer.currentRenderBuffer
        const color = (kind: "fg" | "bg", x: number, y: number) =>
          Array.from(
            buffer.buffers[kind].slice(
              (y * buffer.width + x) * 4,
              (y * buffer.width + x) * 4 + 3,
            ),
            (value) => value & 255,
          )
        expect(color("fg", 0, 0)).toEqual([105, 105, 105])
        const background = RGBA.fromHex(opencodeTheme.backgroundPanel).toInts()
        expect(color("bg", 0, 0)).toEqual(
          background
            .slice(0, 3)
            .map((value) => Math.round((value * 105) / 255)),
        )
        expect(color("bg", panel.x, panel.y)).toEqual(background.slice(0, 3))
        expect(color("fg", panel.x + 1, panel.y + 1)).toEqual([255, 255, 255])
        expect(placements.length).toBeGreaterThan(0)
        // A full, undimmed placement before the backdrop is the original bug.
        expect(
          placements.every((placement) => placement.image !== original),
        ).toBe(true)
        const expectedColors = new Set<string>()
        for (let index = 0; index < originalPixels.length; index += 4) {
          const alpha = originalPixels[index + 3]! / 255
          expectedColors.add(
            [...originalPixels.slice(index, index + 3)]
              .map((value, channel) =>
                Math.round(
                  ((value * alpha + background[channel]! * (1 - alpha)) * 105) /
                    255,
                ),
              )
              .concat(255)
              .join(","),
          )
        }
        const actualColors = new Set<string>()
        for (const placement of placements) {
          if (protocol === "sixel") {
            expect(placement.pixelWidth).toBeGreaterThan(0)
            expect(placement.pixelHeight).toBeGreaterThan(0)
          }
          const overlaps =
            placement.x < panel.x + panel.width &&
            placement.x + placement.width > panel.x &&
            placement.y < panel.y + panel.height &&
            placement.y + placement.height > panel.y
          expect(overlaps).toBe(false)
          for (let index = 0; index < placement.pixels.length; index += 4) {
            actualColors.add(placement.pixels.slice(index, index + 4).join(","))
            expect(placement.pixels[index + 3]).toBe(255)
            expect(
              Math.max(...placement.pixels.slice(index, index + 3)),
            ).toBeLessThanOrEqual(105)
          }
        }
        expect(actualColors).toEqual(expectedColors)
        const fitted = retained.getFittedSize(retained.width, retained.height)
        const left =
          retained.screenX + Math.floor((retained.width - fitted.width) / 2)
        const top =
          retained.screenY + Math.floor((retained.height - fitted.height) / 2)
        let visible = 0
        for (let y = top; y < top + fitted.height; y++) {
          for (let x = left; x < left + fitted.width; x++) {
            const covered =
              x >= panel.x &&
              x < panel.x + panel.width &&
              y >= panel.y &&
              y < panel.y + panel.height
            const isImage =
              (buffer.buffers.char[y * buffer.width + x]! & 0xc0000000) ===
              0x40000000
            expect(isImage).toBe(!covered)
            if (isImage) visible++
          }
        }
        expect(visible).toBeGreaterThan(0)
        expect(setup.image()).toBe(retained)
        expect(retained.image).toBe(original)
        expect(original.raw().data).toEqual(originalPixels)
        placements.length = 0
        await act(async () => setup.modal(false))
        await act(async () => setup.renderOnce())
        expect(placements).toHaveLength(1)
        expect(placements[0]!.image).toBe(original)
        expect(placements[0]!.pixels).toEqual(originalPixels)
        expect(color("fg", 0, 0)).toEqual([255, 255, 255])
      } finally {
        restore()
      }
    },
  )

  it.each(["command-palette", "help", "save-response"] as const)(
    "keeps images behind actual %s controls and restores them after dismissal",
    async (kind) => {
      const setup = await mount("kitty", kind)
      const original = setup.image().image!
      const { placements, restore } = recordPlacements()
      const backgroundKeys: string[] = []
      const dispose = setup.keymap.intercept(
        "key",
        (ctx) => backgroundKeys.push(ctx.event.name),
        { priority: 0 },
      )
      try {
        await act(async () => setup.modal(true))
        await setup.render()
        const panel = mountedModalBackdrop(
          setup.renderer.root,
        )!.getChildren()[0]!
        expect(placements.length).toBeGreaterThan(0)
        for (const placement of placements) {
          expect(
            placement.x < panel.x + panel.width &&
              placement.x + placement.width > panel.x &&
              placement.y < panel.y + panel.height &&
              placement.y + placement.height > panel.y,
          ).toBe(false)
        }
        expect(setup.image().image).toBe(original)
        expect(setup.captureCharFrame()).toContain(
          kind === "help"
            ? "Keybindings"
            : kind === "save-response"
              ? "Save response"
              : "Commands",
        )
        await act(async () => setup.host.press("escape"))
        await setup.render()
        if (
          kind === "save-response" &&
          mountedModalBackdrop(setup.renderer.root)
        ) {
          await act(async () => setup.host.press("escape"))
          await setup.render()
        }
        expect(Boolean(mountedModalBackdrop(setup.renderer.root))).toBe(false)
        expect(setup.image().image).toBe(original)
        expect(backgroundKeys).toEqual([])
        await act(async () => setup.modal(true))
        await setup.render()
        await act(async () => setup.mockMouse.click(0, 0, MouseButtons.LEFT))
        await setup.render()
        expect(Boolean(mountedModalBackdrop(setup.renderer.root))).toBe(false)
      } finally {
        dispose()
        restore()
      }
    },
  )

  it.each(["variables", "save-response"] as const)(
    "crops native placements around separately portalled %s completion menus",
    async (kind) => {
      const directory = await mkdtemp(join(os.tmpdir(), "noodle-modal-"))
      for (let index = 0; index < 8; index++) {
        await writeFile(join(directory, `image-${index}.png`), pixels)
      }
      const home = spyOn(os, "homedir").mockReturnValue(directory)
      const value = kind === "variables" ? "$TOKEN" : "@/"
      const setup = await mount("sixel", kind)
      await act(async () => setup.modal(true))
      await setup.render()
      const { placements, restore } = recordPlacements()
      try {
        await act(async () => {
          setup.mockInput.pressKey("\x01")
          setup.mockInput.pressKey("\x0b")
          await setup.mockInput.typeText(value)
        })
        const id =
          kind === "variables" ? "var-completion-menu" : "path-completion-menu"
        const deadline = Date.now() + 2000
        let popup = setup.renderer.root.findDescendantById(id)
        while (
          !popup?.visible ||
          !setup
            .captureCharFrame()
            .includes(kind === "variables" ? "TOKEN_ONE" : "image-0.png")
        ) {
          if (Date.now() > deadline)
            throw new Error("Completion did not become visible")
          await setup.render()
          popup = setup.renderer.root.findDescendantById(id)
        }
        placements.length = 0
        await setup.render()
        expect(placements.length).toBeGreaterThan(0)
        const panel = mountedModalBackdrop(
          setup.renderer.root,
        )!.getChildren()[0]!
        expect(
          popup!.y + popup!.height > panel.y + panel.height ||
            popup!.x + popup!.width > panel.x + panel.width,
        ).toBe(true)
        for (const placement of placements) {
          expect(
            placement.x < popup!.x + popup!.width &&
              placement.x + placement.width > popup!.x &&
              placement.y < popup!.y + popup!.height &&
              placement.y + placement.height > popup!.y,
          ).toBe(false)
        }
        const buffer = setup.renderer.currentRenderBuffer
        for (
          let y = popup!.y;
          y < Math.min(buffer.height, popup!.y + popup!.height);
          y++
        ) {
          for (
            let x = popup!.x;
            x < Math.min(buffer.width, popup!.x + popup!.width);
            x++
          ) {
            expect(
              (buffer.buffers.char[y * buffer.width + x]! & 0xc0000000) ===
                0x40000000,
            ).toBe(false)
          }
        }
        await act(async () => setup.host.press("escape"))
        await setup.render()
        expect(Boolean(setup.renderer.root.findDescendantById(id))).toBe(false)
        expect(Boolean(mountedModalBackdrop(setup.renderer.root))).toBe(true)
        if (kind === "save-response") {
          await act(async () =>
            setup.saveRef.current!.setError("Output already exists"),
          )
          await setup.render()
          expect(setup.captureCharFrame()).toContain("Output already exists")
          expect(setup.saveRef.current!.confirm()).toBe(value)
          await act(async () => setup.host.press("escape"))
          await setup.render()
          expect(Boolean(mountedModalBackdrop(setup.renderer.root))).toBe(false)
          expect(setup.confirmed).toEqual([])
        }
      } finally {
        restore()
        home.mockRestore()
        await rm(directory, { recursive: true, force: true })
      }
    },
  )

  it("caches crops and disposes them on pane/modal resize, close, tab changes, response replacement, and destruction", async () => {
    const setup = await mount("kitty")
    const original = setup.image().image!
    const { placements, restore } = recordPlacements()
    const live = () => [...new Set(placements.map((part) => part.image))]
    const disposed = (images: NativeImage[]) =>
      images.forEach((image) => expect(() => image.info()).toThrow())
    try {
      await act(async () => setup.modal(true))
      await setup.render()
      let previous = live()
      expect(previous.length).toBeGreaterThan(0)
      placements.length = 0
      await setup.render()
      expect(live()).toEqual(previous)
      placements.length = 0
      await act(async () => setup.resizeModal({ width: 16, height: 10 }))
      await setup.render()
      disposed(previous)
      previous = live()
      placements.length = 0
      await act(async () => setup.renderer.resize(60, 24))
      await setup.render()
      disposed(previous)
      previous = live()
      placements.length = 0
      await act(async () => setup.modal(false))
      await setup.render()
      disposed(previous)
      expect(original.info().width).toBe(4)
      placements.length = 0
      await act(async () => setup.modal(true))
      await setup.render()
      previous = live()
      placements.length = 0
      await act(async () => setup.showBody(false))
      await setup.render()
      disposed([...previous, original])
      await act(async () => setup.showBody(true))
      await setup.render()
      const nextOriginal = setup.image().image!
      previous = live()
      placements.length = 0
      await act(async () => setup.replace(pixels.slice()))
      await setup.render()
      disposed([...previous, nextOriginal])
      previous = live()
      const lastOriginal = setup.image().image!
      await act(async () => setup.renderer.destroy())
      disposed([...previous, lastOriginal])
    } finally {
      restore()
    }
  })

  it("retains explicitly activated large previews and naturally occludes fully covered previews", async () => {
    const bytes = new Uint8Array(5 * 1024 * 1024 + 1)
    bytes.set(
      Buffer.from(
        "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
        "base64",
      ),
    )
    const setup = await mount("kitty", "panel", bytes)
    expect(setup.image()).toBeUndefined()
    await act(async () => setup.host.press("v"))
    await setup.render()
    const image = setup.image()
    const original = image.image!
    await act(async () => setup.resizeModal({ width: 80, height: 30 }))
    const { placements, restore } = recordPlacements()
    try {
      await act(async () => setup.modal(true))
      await setup.render()
      expect(placements).toHaveLength(0)
      expect(setup.image()).toBe(image)
      expect(image.image).toBe(original)
      await act(async () => setup.modal(false))
      await setup.render()
      expect(placements[placements.length - 1]!.image).toBe(original)
    } finally {
      restore()
    }
  })

  it("releases partial native allocations and keeps the file view on composition failure", async () => {
    const setup = await mount("kitty")
    const extract = NativeImage.prototype.extract
    const allocated: NativeImage[] = []
    let calls = 0
    const spy = spyOn(NativeImage.prototype, "extract").mockImplementation(
      function (this: NativeImage, options) {
        if (++calls === 2) throw new Error("Native allocation failed")
        const crop = extract.call(this, options)
        allocated.push(crop)
        return crop
      },
    )
    try {
      await act(async () => setup.modal(true))
      await setup.render()
      await setup.render()
      expect(allocated).toHaveLength(1)
      expect(() => allocated[0]!.info()).toThrow()
      expect(setup.captureCharFrame()).toContain("Preview unavailable:")
      expect(setup.captureCharFrame()).toContain("Save file")
      expect(setup.image()).toBeUndefined()
    } finally {
      spy.mockRestore()
    }
  })

  it.each(["blocks", "kitty", "sixel"] as const)(
    "downsamples opaque originals without upscaling for %s and releases all derived handles",
    async (protocol) => {
      const setup = await mount(protocol)
      const source = NativeImage.fromRgba(
        new Uint8Array(1600 * 800 * 4).fill(255),
        1600,
        800,
      )
      await act(async () => {
        setup.image().source = source
        await setup.image().loadPromise
      })
      source.dispose()
      const original = setup.image().image!
      const created: NativeImage[] = []
      const resized: NativeImage[] = []
      const fromRgba = NativeImage.fromRgba
      const resize = NativeImage.prototype.resize
      const createSpy = spyOn(NativeImage, "fromRgba").mockImplementation(
        (...args) => {
          const image = fromRgba(...args)
          created.push(image)
          return image
        },
      )
      const resizeSpy = spyOn(
        NativeImage.prototype,
        "resize",
      ).mockImplementation(function (this: NativeImage, options) {
        const image = resize.call(this, options)
        resized.push(image)
        return image
      })
      try {
        await act(async () => setup.modal(true))
        await setup.render()
        const fitted = setup
          .image()
          .getFittedSize(setup.image().width, setup.image().height)
        const scale =
          protocol === "blocks"
            ? Math.min(1, (fitted.width * 2) / 1600, (fitted.height * 2) / 800)
            : Math.min(
                1,
                (fitted.width * 10) / 1600,
                (fitted.height * 20) / 800,
              )
        expect(created).toHaveLength(1)
        expect(created[0]!.width).toBe(Math.round(1600 * scale))
        expect(created[0]!.height).toBe(Math.round(800 * scale))
        expect(created[0]!.raw().data.slice(0, 4)).toEqual(
          new Uint8Array([105, 105, 105, 255]),
        )
        expect(resized).toHaveLength(1)
        expect(() => resized[0]!.info()).toThrow()
        await act(async () => setup.modal(false))
        await setup.render()
        expect(() => created[0]!.info()).toThrow()
        expect(original.width).toBe(1600)
        expect(original.raw().data.every((value) => value === 255)).toBe(true)
      } finally {
        createSpy.mockRestore()
        resizeSpy.mockRestore()
      }
    },
  )

  it("keeps Kitty source resolution when terminal pixel geometry is unavailable", async () => {
    const setup = await mount("kitty")
    Object.defineProperty(setup.renderer, "resolution", { value: null })
    const source = NativeImage.fromRgba(
      new Uint8Array(400 * 200 * 4).fill(255),
      400,
      200,
    )
    await act(async () => {
      setup.image().source = source
      await setup.image().loadPromise
    })
    source.dispose()
    const fromRgba = NativeImage.fromRgba
    const sizes: number[][] = []
    const spy = spyOn(NativeImage, "fromRgba").mockImplementation((...args) => {
      sizes.push([args[1], args[2]])
      return fromRgba(...args)
    })
    try {
      await act(async () => setup.modal(true))
      await setup.render()
      expect(sizes).toEqual([[400, 200]])
      expect(setup.image().effectiveProtocol).toBe("kitty")
    } finally {
      spy.mockRestore()
    }
  })
})
