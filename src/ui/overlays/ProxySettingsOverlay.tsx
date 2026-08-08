import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react"
import { MouseButton, type InputRenderable } from "@opentui/core"
import type {
  AppProxySettings,
  CollectionProxySettings,
  Environment,
} from "../../schema"
import { normalizeBypass, validateProxyTemplate } from "../../proxy"
import { Select, type SelectItem } from "../Select"
import { VarInput, type VarInputHandle } from "../VarInput"
import { useTheme } from "../theme"
import { EscapeClose } from "./EscapeClose"
import { Overlay } from "./Overlay"

export interface ProxySettingsValues {
  scope: "app" | "collection"
  mode: "system" | "inherit" | "custom" | "off"
  url: string
  bypass: string[]
}

export interface ProxySettingsOverlayHandle {
  cycleFocus: (direction: 1 | -1) => void
  commitField: () => void
  confirm: () => ProxySettingsValues | null
  getFocus: () => "scope" | "mode" | "proxy-url" | "bypass"
  setError: (message: string) => void
}

interface ProxySettingsOverlayProps {
  visible: boolean
  collectionAvailable: boolean
  appProxy?: AppProxySettings
  collectionProxy?: CollectionProxySettings
  activeEnv?: Environment | null
  onConfirm?: () => void
  onClose?: () => void
}

type Focus = "scope" | "mode" | "proxy-url" | "bypass"

function valuesFor(
  proxy: AppProxySettings | CollectionProxySettings | undefined,
  fallback: "system" | "inherit",
): {
  mode: "system" | "inherit" | "custom" | "off"
  url: string
  bypass: string
} {
  if (!proxy || proxy.mode === "system" || proxy.mode === "inherit") {
    return { mode: fallback, url: "", bypass: "" }
  }
  if (proxy.mode === "off") return { mode: "off", url: "", bypass: "" }
  return {
    mode: "custom",
    url: proxy.url,
    bypass: (proxy.bypass ?? []).join(", "),
  }
}

export const ProxySettingsOverlay = forwardRef<
  ProxySettingsOverlayHandle,
  ProxySettingsOverlayProps
>(function ProxySettingsOverlay(
  {
    visible,
    collectionAvailable,
    appProxy,
    collectionProxy,
    activeEnv,
    onConfirm,
    onClose,
  },
  ref,
) {
  const theme = useTheme()
  const [scope, setScope] = useState<"app" | "collection">("app")
  const [appValues, setAppValues] = useState(() =>
    valuesFor(appProxy, "system"),
  )
  const [collectionValues, setCollectionValues] = useState(() =>
    valuesFor(collectionProxy, "inherit"),
  )
  const [focus, setFocus] = useState<Focus>("scope")
  const [errorText, setErrorText] = useState<string | null>(null)
  const [selectOpen, setSelectOpen] = useState(false)
  const [hoveredAction, setHoveredAction] = useState<"save" | "close" | null>(
    null,
  )
  const urlRef = useRef<VarInputHandle | null>(null)
  const bypassRef = useRef<InputRenderable | null>(null)

  const current = scope === "app" ? appValues : collectionValues
  const updateCurrent = (patch: Partial<typeof current>) => {
    const update = (values: typeof current) => ({ ...values, ...patch })
    if (scope === "app") setAppValues(update)
    else setCollectionValues(update)
  }

  const scopeItems = useMemo<SelectItem[]>(
    () => [
      { id: "app", label: "App-wide default" },
      ...(collectionAvailable
        ? [{ id: "collection", label: "Current collection" }]
        : []),
    ],
    [collectionAvailable],
  )
  const modeItems = useMemo<SelectItem[]>(
    () =>
      scope === "app"
        ? [
            { id: "system", label: "Use system proxy" },
            { id: "custom", label: "Custom proxy" },
            { id: "off", label: "Off (direct connections)" },
          ]
        : [
            { id: "inherit", label: "Inherit app default" },
            { id: "custom", label: "Custom proxy" },
            { id: "off", label: "Off (direct connections)" },
          ],
    [scope],
  )
  const focusOrder: Focus[] =
    current.mode === "custom"
      ? ["scope", "mode", "proxy-url", "bypass"]
      : ["scope", "mode"]

  useImperativeHandle(ref, () => ({
    cycleFocus: (direction) => {
      setErrorText(null)
      setFocus((previous) => {
        const index = focusOrder.indexOf(previous)
        return focusOrder[
          (index + direction + focusOrder.length) % focusOrder.length
        ]!
      })
    },
    commitField: () => {
      const index = focusOrder.indexOf(focus)
      setFocus(focusOrder[(index + 1) % focusOrder.length]!)
    },
    confirm: () => {
      if (current.mode === "custom") {
        const validationError = validateProxyTemplate(current.url)
        if (validationError) {
          setErrorText(validationError)
          return null
        }
      }
      setErrorText(null)
      return {
        scope,
        mode: current.mode,
        url: current.url.trim(),
        bypass: normalizeBypass(current.bypass.split(",")),
      }
    },
    getFocus: () => focus,
    setError: setErrorText,
  }))

  useEffect(() => {
    if (!visible) return
    setScope("app")
    setAppValues(valuesFor(appProxy, "system"))
    setCollectionValues(valuesFor(collectionProxy, "inherit"))
    setFocus("scope")
    setErrorText(null)
  }, [visible, appProxy, collectionProxy])

  useEffect(() => {
    if (focus === "proxy-url") urlRef.current?.focus()
    else if (focus === "bypass") bypassRef.current?.focus()
    else {
      bypassRef.current?.blur()
    }
  }, [focus])

  return (
    <Overlay visible={visible} width={64} padding={1} gap={1}>
      <box
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          paddingBottom: 1,
          paddingX: 2,
        }}
      >
        <text fg={theme.text}>Proxy Settings</text>
        <EscapeClose onClose={() => onClose?.()} />
      </box>
      <box
        style={{
          paddingX: 2,
          flexDirection: "column",
          gap: 1,
          paddingBottom: 1,
        }}
      >
        <box style={{ flexDirection: "column", zIndex: selectOpen ? 2 : 0 }}>
          <text fg={theme.textMuted}>Scope</text>
          <Select
            items={scopeItems}
            value={scope}
            onChange={(next) => {
              setScope(next as "app" | "collection")
              setFocus("scope")
            }}
            focused={focus === "scope"}
            onOpenChange={setSelectOpen}
            onActivate={() => setFocus("scope")}
            triggerPriority={110}
          />
        </box>
        <box style={{ flexDirection: "column", zIndex: selectOpen ? 1 : 0 }}>
          <text fg={theme.textMuted}>Mode</text>
          <Select
            items={modeItems}
            value={current.mode}
            onChange={(next) => {
              updateCurrent({
                mode: next as "system" | "inherit" | "custom" | "off",
              })
              setFocus("mode")
            }}
            focused={focus === "mode"}
            onOpenChange={setSelectOpen}
            onActivate={() => setFocus("mode")}
            triggerPriority={110}
          />
        </box>
        {current.mode === "custom" && (
          <>
            <box style={{ flexDirection: "column" }}>
              <text fg={theme.textMuted}>Proxy URL</text>
              <VarInput
                ref={urlRef}
                value={current.url}
                env={activeEnv ?? null}
                isEditing
                isFocused={focus === "proxy-url"}
                onChange={(url) => updateCurrent({ url })}
                placeholder="http://$PROXY_USER:$PROXY_PASSWORD@proxy:8080"
                backgroundColor={theme.backgroundElement}
                focusedBackgroundColor={theme.borderSubtle}
                onFocus={() => setFocus("proxy-url")}
              />
            </box>
            <box style={{ flexDirection: "column" }}>
              <text fg={theme.textMuted}>Bypass hosts</text>
              <input
                ref={bypassRef}
                value={current.bypass}
                placeholder="localhost, .internal.example, api.example:8443"
                onInput={(bypass) => updateCurrent({ bypass })}
                onMouseDown={(event) => {
                  if (event.button === MouseButton.LEFT) setFocus("bypass")
                }}
                focused={focus === "bypass"}
                backgroundColor={theme.backgroundElement}
                focusedBackgroundColor={theme.borderSubtle}
                textColor={theme.text}
                cursorColor={theme.primary}
                placeholderColor={theme.textMuted}
              />
              <text fg={theme.textMuted}>
                Comma-separated. Supports *, hosts, .domains, IPs, and ports.
              </text>
            </box>
          </>
        )}
        {errorText && <text fg={theme.error}>{errorText}</text>}
      </box>
      <box
        style={{
          flexDirection: "row",
          justifyContent: "flex-end",
          gap: 1,
          paddingX: 2,
        }}
      >
        <box
          onMouseDown={(event) => {
            if (event.button !== MouseButton.LEFT) return
            onConfirm?.()
            event.preventDefault()
            event.stopPropagation()
          }}
          onMouseOver={() => setHoveredAction("save")}
          onMouseOut={() => setHoveredAction(null)}
          style={{
            flexDirection: "row",
            paddingLeft: 1,
            paddingRight: 1,
            backgroundColor:
              hoveredAction === "save" ? theme.backgroundElement : undefined,
          }}
        >
          <text fg={theme.text}>^S</text>
          <text fg={theme.textMuted}> save</text>
        </box>
        <box
          onMouseDown={(event) => {
            if (event.button !== MouseButton.LEFT) return
            onClose?.()
            event.preventDefault()
            event.stopPropagation()
          }}
          onMouseOver={() => setHoveredAction("close")}
          onMouseOut={() => setHoveredAction(null)}
          style={{
            flexDirection: "row",
            paddingLeft: 1,
            paddingRight: 1,
            backgroundColor:
              hoveredAction === "close" ? theme.backgroundElement : undefined,
          }}
        >
          <text fg={theme.text}>esc</text>
          <text fg={theme.textMuted}> close</text>
        </box>
      </box>
    </Overlay>
  )
})
