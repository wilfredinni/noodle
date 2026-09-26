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
import { CookieRow } from "../CookieRow"
import { useTheme } from "../theme"
import { ScriptAuthoringContext, ScriptEditor } from "./ScriptEditor"

type Props = Omit<
  ComponentProps<typeof ScriptEditor>,
  "value" | "source" | "onControlFocus"
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
  const references = useRef<BoxRenderable | null>(null)
  const [size, setSize] = useState({ width: 80, height: 12 })
  const [referenceHeight, setReferenceHeight] = useState(0)
  const [controlTarget, setControlTarget] = useState("script-source-field")
  const [adding, setAdding] = useState(false)
  const [selectOpen, setSelectOpen] = useState(false)
  const [orderExpanded, setOrderExpanded] = useState(false)
  const [orderFocused, setOrderFocused] = useState(false)
  const [orderHovered, setOrderHovered] = useState(false)
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
          if (orderFocused) {
            if (
              ![
                "up",
                "down",
                "return",
                "space",
                "left",
                "right",
                "escape",
              ].includes(event.name)
            )
              return
            event.preventDefault()
            event.stopPropagation()
            if (event.name === "down" || event.name === "escape")
              setOrderFocused(false)
            else if (event.name === "return" || event.name === "space")
              setOrderExpanded((expanded) => !expanded)
            else if (event.name === "left" || event.name === "right")
              setOrderExpanded(event.name === "right")
            return
          }
          if (
            !props.editing &&
            event.name === "up" &&
            (showAdd || controlTarget === "script-source-field")
          ) {
            event.preventDefault()
            event.stopPropagation()
            setOrderFocused(true)
            return
          }
          if (props.interactive === false) return
          if (showAdd && (event.name === "return" || event.name === "space")) {
            event.preventDefault()
            event.stopPropagation()
            add()
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
      controlTarget,
    ],
  )

  useEffect(() => {
    if (!props.focused || !inherited) return
    const reveal = () =>
      scroll.current?.scrollChildIntoView(
        orderFocused
          ? "script-execution-order"
          : showAdd
            ? "script-add"
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
    referenceHeight,
    orderFocused,
    orderExpanded,
    renderer,
  ])

  const editor = (
    <ScriptEditor
      {...props}
      value={value}
      source={source}
      focused={props.focused && !orderFocused}
      editing={props.editing && !orderFocused}
      onFocus={() => {
        setOrderFocused(false)
        onFocus?.()
      }}
      onActivate={() => {
        setOrderFocused(false)
        props.onActivate()
      }}
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
        <box
          ref={references}
          flexDirection="column"
          flexShrink={0}
          marginBottom={1}
          onSizeChange={() =>
            setReferenceHeight(references.current?.height ?? 0)
          }
        >
          <CookieRow
            id="script-execution-order"
            kindLabel=""
            kindColor={theme.text}
            kindWidth={0}
            name=""
            nameWidth={0}
            value={
              props.phase === "pre"
                ? "Scripts run in this order before sending the request."
                : props.phase === "post"
                  ? "Scripts run in this order after the response and captures."
                  : "Tests run in this order after declarative assertions."
            }
            valueColor={theme.text}
            selected={props.focused && orderFocused}
            expanded={orderExpanded}
            hovered={orderHovered}
            details={[]}
            onSelect={() => {
              props.onExit()
              setOrderFocused(true)
            }}
            onToggleExpanded={() => setOrderExpanded((expanded) => !expanded)}
            onHover={setOrderHovered}
            onPaneFocus={onFocus}
          />
          {orderExpanded && (
            <box flexDirection="column" flexShrink={0} paddingLeft={3}>
              {blocks.map((block, index) => (
                <box
                  key={`${block.source.scope}:${block.source.scopeId}`}
                  id={`script-reference-${index}`}
                  flexDirection="row"
                  flexShrink={0}
                >
                  {blocks.length > 1 && (
                    <text fg={theme.textMuted} width={3} flexShrink={0}>
                      {index + 1}
                    </text>
                  )}
                  <box
                    flexDirection={size.width < 60 ? "column" : "row"}
                    flexGrow={1}
                    minWidth={0}
                    gap={size.width < 60 ? 0 : 2}
                  >
                    <text
                      fg={
                        block.source.scope === "request"
                          ? theme.primary
                          : theme.text
                      }
                      width={size.width < 60 ? "100%" : "42%"}
                      flexShrink={0}
                      wrapMode="char"
                    >
                      {block.source.scope === "request"
                        ? "This request"
                        : block.source.scope === "collection"
                          ? `Collection: ${context?.collection?.name ?? block.source.scopeId}`
                          : `Folder: ${block.source.scopeId}`}
                    </text>
                    <text fg={theme.textMuted} flexGrow={1} wrapMode="char">
                      {isExternalScriptSource(scriptText(block, props.phase))
                        ? block.source.scope === "request"
                          ? "External file"
                          : scriptText(block, props.phase)
                        : "Inline"}
                    </text>
                  </box>
                </box>
              ))}
            </box>
          )}
        </box>
        {showAdd ? (
          <box flexDirection="column" flexShrink={0} gap={1}>
            <text fg={theme.textMuted}>No script on this request.</text>
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
              size.height - referenceHeight - 1,
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
