import {
  useContext,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
} from "react"
import type { BoxRenderable, ScrollBoxRenderable } from "@opentui/core"
import { useKeymap } from "@opentui/keymap/react"
import { useRenderer } from "@opentui/react"
import type { Request } from "../../schema"
import { requestScriptBlocks } from "../../scriptInheritance"
import { scriptText } from "../../scriptAuthoring"
import { isExternalScriptSource } from "../../lang/scriptSource"
import { ActionButton } from "../ActionButton"
import { useTheme } from "../theme"
import { ScriptAuthoringContext, ScriptEditor } from "./ScriptEditor"

type Props = Omit<
  ComponentProps<typeof ScriptEditor>,
  "value" | "source" | "onControlFocus" | "onShowOrder"
> & {
  request: Request
}

export function RequestScriptTab({ request, onFocus, ...props }: Props) {
  const context = useContext(ScriptAuthoringContext)
  const theme = useTheme()
  const keymap = useKeymap()
  const renderer = useRenderer()
  const scroll = useRef<ScrollBoxRenderable | null>(null)
  const container = useRef<BoxRenderable | null>(null)
  const [size, setSize] = useState({ width: 80, height: 12 })
  const [controlTarget, setControlTarget] = useState("script-source-field")
  const [adding, setAdding] = useState(false)
  const [selectOpen, setSelectOpen] = useState(false)
  const [orderFocused, setOrderFocused] = useState(false)
  const value = scriptText(request, props.phase)
  const source = {
    scope: "request" as const,
    scopeId: request.id,
    path: `${request.id}.yml`,
  }
  const blocks = requestScriptBlocks(
    request,
    context?.collection ?? undefined,
  ).filter((block) => scriptText(block, props.phase))
  if (props.phase === "post") blocks.reverse()
  const inherited = blocks.some((block) => block.source.scope !== "request")
  const showAdd = inherited && !value && !adding

  const showOrder = () =>
    context?.showOrder?.({
      phase: props.phase,
      entries: blocks.map((block) => ({
        current: block.source.scope === "request",
        label:
          block.source.scope === "request"
            ? "This request"
            : block.source.scope === "collection"
              ? `Collection: ${context.collection?.name ?? block.source.scopeId}`
              : `Folder: ${block.source.scopeId}`,
        detail: isExternalScriptSource(scriptText(block, props.phase))
          ? block.source.scope === "request"
            ? "External file"
            : scriptText(block, props.phase)
          : "Inline",
      })),
    })
  const add = () => {
    if (props.interactive === false) return
    setOrderFocused(false)
    setAdding(true)
    onFocus?.()
    props.onActivate()
  }

  useEffect(() => {
    if (!props.focused && !value) setAdding(false)
  }, [props.focused, value])

  useEffect(
    () =>
      keymap.intercept(
        "key",
        ({ event }) => {
          if (
            !inherited ||
            !props.focused ||
            selectOpen ||
            event.ctrl ||
            event.meta ||
            event.option ||
            event.super ||
            event.hyper ||
            keymap.getData("app.overlay") !== "none"
          )
            return
          if (
            showAdd &&
            (event.name === "tab" ||
              event.name === "up" ||
              event.name === "down" ||
              (orderFocused && event.name === "escape"))
          ) {
            event.preventDefault()
            event.stopPropagation()
            setOrderFocused(
              event.name === "tab" ? !orderFocused : event.name === "up",
            )
          } else if (
            showAdd &&
            (event.name === "return" || event.name === "space")
          ) {
            event.preventDefault()
            event.stopPropagation()
            if (orderFocused) showOrder()
            else add()
          } else if (adding && !value && event.name === "escape") {
            event.preventDefault()
            event.stopPropagation()
            setAdding(false)
            props.onExit()
          }
        },
        { priority: 160 },
      ),
    [
      keymap,
      inherited,
      props,
      showAdd,
      adding,
      value,
      selectOpen,
      orderFocused,
      showOrder,
    ],
  )

  useEffect(() => {
    if (!props.focused || !inherited) return
    const reveal = () =>
      scroll.current?.scrollChildIntoView(
        showAdd
          ? orderFocused
            ? "script-execution-order"
            : "script-add"
          : controlTarget,
      )
    renderer.once("frame", reveal)
    renderer.requestRender()
    return () => {
      renderer.off("frame", reveal)
    }
  }, [
    props.focused,
    inherited,
    showAdd,
    controlTarget,
    size,
    orderFocused,
    renderer,
  ])

  const editor = (
    <ScriptEditor
      {...props}
      value={value}
      source={source}
      onFocus={onFocus}
      onShowOrder={inherited ? showOrder : undefined}
      onChange={(text) => {
        setAdding(true)
        props.onChange(text)
      }}
      onControlFocus={setControlTarget}
      onSelectOpenChange={(open) => {
        setSelectOpen(open)
        props.onSelectOpenChange?.(open)
      }}
    />
  )
  if (!inherited) return editor

  return (
    <box
      ref={container}
      flexDirection="column"
      flexGrow={1}
      flexBasis={0}
      minHeight={0}
      onSizeChange={() =>
        setSize({
          width: container.current?.width ?? 80,
          height: container.current?.height ?? 12,
        })
      }
    >
      <scrollbox
        ref={scroll}
        id="script-workspace"
        focusable={false}
        scrollY
        scrollX={false}
        flexGrow={1}
        flexBasis={0}
        minHeight={0}
      >
        {showAdd ? (
          <box flexDirection="column" flexShrink={0} gap={1}>
            <box flexDirection="row" alignItems="center" flexShrink={0}>
              <text fg={theme.textMuted} flexGrow={1} minWidth={0}>
                {size.width < 48
                  ? "No request script."
                  : "No script on this request."}
              </text>
              <ActionButton
                id="script-execution-order"
                label={size.width < 48 ? "Order" : "Execution order"}
                focused={props.focused && orderFocused}
                onAction={() => {
                  onFocus?.()
                  setOrderFocused(true)
                  showOrder()
                }}
              />
            </box>
            <ActionButton
              id="script-add"
              label="+ Add request script"
              active={false}
              focused={props.focused && !orderFocused}
              disabled={props.interactive === false}
              onAction={add}
            />
          </box>
        ) : (
          <box
            height={Math.max(
              isExternalScriptSource(value) ? 11 : 10,
              size.height,
            )}
            flexDirection="column"
            flexShrink={0}
          >
            {editor}
          </box>
        )}
      </scrollbox>
    </box>
  )
}
