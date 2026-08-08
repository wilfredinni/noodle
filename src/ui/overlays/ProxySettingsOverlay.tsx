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
import {
  buildStructuredProxyTemplate,
  normalizeBypass,
  parseStructuredProxyTemplate,
  validateProxyTemplate,
  type StructuredProxyFields,
} from "../../proxy"
import { Checkbox } from "../Checkbox"
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
  toggleFocused: () => void
  confirm: () => ProxySettingsValues | null
  getFocus: () => Focus
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

type EditorMode = "fields" | "advanced"
type ProxyMode = "system" | "inherit" | "custom" | "off"
type Focus =
  | "scope"
  | "mode"
  | "editor"
  | "protocol"
  | "hostname"
  | "port"
  | "auth"
  | "username"
  | "password"
  | "proxy-url"
  | "bypass"

interface ProxyFormValues {
  mode: ProxyMode
  editor: EditorMode
  fields: StructuredProxyFields
  url: string
  bypass: string
}

const EMPTY_FIELDS: StructuredProxyFields = {
  protocol: "http",
  hostname: "",
  port: "",
  auth: false,
  username: "",
  password: "",
}

function valuesFor(
  proxy: AppProxySettings | CollectionProxySettings | undefined,
  fallback: "system" | "inherit",
): ProxyFormValues {
  if (!proxy || proxy.mode === "system" || proxy.mode === "inherit") {
    return {
      mode: fallback,
      editor: "fields",
      fields: EMPTY_FIELDS,
      url: "",
      bypass: "",
    }
  }
  if (proxy.mode === "off") {
    return {
      mode: "off",
      editor: "fields",
      fields: EMPTY_FIELDS,
      url: "",
      bypass: "",
    }
  }
  const fields = parseStructuredProxyTemplate(proxy.url)
  return {
    mode: "custom",
    editor: fields ? "fields" : "advanced",
    fields: fields ?? EMPTY_FIELDS,
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
  const hostnameRef = useRef<InputRenderable | null>(null)
  const portRef = useRef<InputRenderable | null>(null)
  const usernameRef = useRef<VarInputHandle | null>(null)
  const passwordRef = useRef<VarInputHandle | null>(null)
  const urlRef = useRef<VarInputHandle | null>(null)
  const bypassRef = useRef<InputRenderable | null>(null)

  const current = scope === "app" ? appValues : collectionValues
  const updateCurrent = (patch: Partial<ProxyFormValues>) => {
    const update = (values: ProxyFormValues) => ({ ...values, ...patch })
    if (scope === "app") setAppValues(update)
    else setCollectionValues(update)
  }
  const updateFields = (patch: Partial<StructuredProxyFields>) =>
    updateCurrent({ fields: { ...current.fields, ...patch } })

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
  const editorItems = useMemo<SelectItem[]>(
    () => [
      { id: "fields", label: "Fields" },
      { id: "advanced", label: "Advanced URL" },
    ],
    [],
  )
  const protocolItems = useMemo<SelectItem[]>(
    () => [
      { id: "http", label: "HTTP" },
      { id: "https", label: "HTTPS" },
    ],
    [],
  )
  const focusOrder: Focus[] =
    current.mode !== "custom"
      ? ["scope", "mode"]
      : current.editor === "advanced"
        ? ["scope", "mode", "editor", "proxy-url", "bypass"]
        : [
            "scope",
            "mode",
            "editor",
            "protocol",
            "hostname",
            "port",
            "auth",
            ...(current.fields.auth ? (["username", "password"] as const) : []),
            "bypass",
          ]

  const switchEditor = (editor: EditorMode) => {
    if (editor === current.editor) return
    if (editor === "fields") {
      const fields = parseStructuredProxyTemplate(current.url)
      if (!fields) {
        setErrorText(
          "This URL needs Advanced URL mode. Use an HTTP(S) host, optional port, and $VARNAME credentials only.",
        )
        return
      }
      updateCurrent({ editor, fields })
    } else {
      const result = buildStructuredProxyTemplate(current.fields)
      if ("error" in result) {
        setErrorText(result.error)
        return
      }
      updateCurrent({ editor, url: result.url })
    }
    setErrorText(null)
    setFocus("editor")
  }

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
    toggleFocused: () => {
      if (focus !== "auth") return
      updateFields({ auth: !current.fields.auth })
      setErrorText(null)
    },
    confirm: () => {
      let url = current.url.trim()
      if (current.mode === "custom") {
        if (current.editor === "fields") {
          const result = buildStructuredProxyTemplate(current.fields)
          if ("error" in result) {
            setErrorText(result.error)
            return null
          }
          url = result.url
        } else {
          const validationError = validateProxyTemplate(url)
          if (validationError) {
            setErrorText(validationError)
            return null
          }
        }
      }
      setErrorText(null)
      return {
        scope,
        mode: current.mode,
        url,
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
    if (focus === "hostname") hostnameRef.current?.focus()
    else if (focus === "port") portRef.current?.focus()
    else if (focus === "username") usernameRef.current?.focus()
    else if (focus === "password") passwordRef.current?.focus()
    else if (focus === "proxy-url") urlRef.current?.focus()
    else if (focus === "bypass") bypassRef.current?.focus()
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
        <SelectField
          label="Scope"
          items={scopeItems}
          value={scope}
          focused={focus === "scope"}
          selectOpen={selectOpen}
          onOpenChange={setSelectOpen}
          onActivate={() => setFocus("scope")}
          onChange={(next) => {
            setScope(next as "app" | "collection")
            setFocus("scope")
          }}
        />
        <SelectField
          label="Mode"
          items={modeItems}
          value={current.mode}
          focused={focus === "mode"}
          selectOpen={selectOpen}
          onOpenChange={setSelectOpen}
          onActivate={() => setFocus("mode")}
          onChange={(next) => {
            updateCurrent({ mode: next as ProxyMode })
            setFocus("mode")
          }}
        />
        {current.mode === "custom" && (
          <>
            <SelectField
              label="Editor"
              items={editorItems}
              value={current.editor}
              focused={focus === "editor"}
              selectOpen={selectOpen}
              onOpenChange={setSelectOpen}
              onActivate={() => setFocus("editor")}
              onChange={(next) => switchEditor(next as EditorMode)}
            />
            {current.editor === "fields" ? (
              <>
                <SelectField
                  label="Protocol"
                  items={protocolItems}
                  value={current.fields.protocol}
                  focused={focus === "protocol"}
                  selectOpen={selectOpen}
                  onOpenChange={setSelectOpen}
                  onActivate={() => setFocus("protocol")}
                  onChange={(protocol) => {
                    updateFields({ protocol: protocol as "http" | "https" })
                    setFocus("protocol")
                  }}
                />
                <TextField
                  label="Hostname"
                  inputRef={hostnameRef}
                  value={current.fields.hostname}
                  placeholder="proxy.example or ::1"
                  focused={focus === "hostname"}
                  theme={theme}
                  onFocus={() => setFocus("hostname")}
                  onChange={(hostname) => updateFields({ hostname })}
                />
                <TextField
                  label="Port"
                  inputRef={portRef}
                  value={current.fields.port}
                  placeholder="optional"
                  focused={focus === "port"}
                  theme={theme}
                  onFocus={() => setFocus("port")}
                  onChange={(port) => updateFields({ port })}
                />
                <box
                  onMouseDown={(event) => {
                    if (event.button !== MouseButton.LEFT) return
                    updateFields({ auth: !current.fields.auth })
                    setFocus("auth")
                    event.preventDefault()
                    event.stopPropagation()
                  }}
                  style={{ flexDirection: "row" }}
                >
                  <Checkbox checked={current.fields.auth} theme={theme} />
                  <text fg={focus === "auth" ? theme.text : theme.textMuted}>
                    Proxy authentication
                  </text>
                </box>
                {current.fields.auth && (
                  <>
                    <VariableField
                      label="Username variable"
                      inputRef={usernameRef}
                      value={current.fields.username}
                      placeholder="$PROXY_USER"
                      focused={focus === "username"}
                      env={activeEnv ?? null}
                      theme={theme}
                      onFocus={() => setFocus("username")}
                      onChange={(username) => updateFields({ username })}
                    />
                    <VariableField
                      label="Password variable"
                      inputRef={passwordRef}
                      value={current.fields.password}
                      placeholder="$PROXY_PASSWORD"
                      focused={focus === "password"}
                      env={activeEnv ?? null}
                      theme={theme}
                      onFocus={() => setFocus("password")}
                      onChange={(password) => updateFields({ password })}
                    />
                  </>
                )}
              </>
            ) : (
              <VariableField
                label="Proxy URL"
                inputRef={urlRef}
                value={current.url}
                placeholder="http://$PROXY_USER:$PROXY_PASSWORD@proxy:8080"
                focused={focus === "proxy-url"}
                env={activeEnv ?? null}
                theme={theme}
                onFocus={() => setFocus("proxy-url")}
                onChange={(url) => updateCurrent({ url })}
              />
            )}
            <TextField
              label="Bypass hosts"
              inputRef={bypassRef}
              value={current.bypass}
              placeholder="localhost, .internal.example, api.example:8443"
              focused={focus === "bypass"}
              theme={theme}
              onFocus={() => setFocus("bypass")}
              onChange={(bypass) => updateCurrent({ bypass })}
              hint="Comma-separated. Supports *, hosts, .domains, IPs, and ports."
            />
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
        <FooterAction
          keyHint="^S"
          label="save"
          hovered={hoveredAction === "save"}
          theme={theme}
          onHover={() => setHoveredAction("save")}
          onLeave={() => setHoveredAction(null)}
          onClick={onConfirm}
        />
        <FooterAction
          keyHint="esc"
          label="close"
          hovered={hoveredAction === "close"}
          theme={theme}
          onHover={() => setHoveredAction("close")}
          onLeave={() => setHoveredAction(null)}
          onClick={onClose}
        />
      </box>
    </Overlay>
  )
})

function SelectField({
  label,
  items,
  value,
  focused,
  selectOpen,
  onOpenChange,
  onActivate,
  onChange,
}: {
  label: string
  items: SelectItem[]
  value: string
  focused: boolean
  selectOpen: boolean
  onOpenChange: (open: boolean) => void
  onActivate: () => void
  onChange: (value: string) => void
}) {
  const theme = useTheme()
  return (
    <box style={{ flexDirection: "column", zIndex: selectOpen ? 2 : 0 }}>
      <text fg={theme.textMuted}>{label}</text>
      <Select
        items={items}
        value={value}
        onChange={onChange}
        focused={focused}
        onOpenChange={onOpenChange}
        onActivate={onActivate}
        triggerPriority={110}
      />
    </box>
  )
}

function TextField({
  label,
  value,
  placeholder,
  focused,
  theme,
  onFocus,
  onChange,
  hint,
  inputRef,
}: {
  label: string
  value: string
  placeholder: string
  focused: boolean
  theme: ReturnType<typeof useTheme>
  onFocus: () => void
  onChange: (value: string) => void
  hint?: string
  inputRef: { current: InputRenderable | null }
}) {
  return (
    <box style={{ flexDirection: "column" }}>
      <text fg={theme.textMuted}>{label}</text>
      <input
        ref={inputRef}
        value={value}
        placeholder={placeholder}
        onInput={onChange}
        onMouseDown={(event) => {
          if (event.button === MouseButton.LEFT) onFocus()
        }}
        focused={focused}
        backgroundColor={theme.backgroundElement}
        focusedBackgroundColor={theme.borderSubtle}
        textColor={theme.text}
        cursorColor={theme.primary}
        placeholderColor={theme.textMuted}
      />
      {hint && <text fg={theme.textMuted}>{hint}</text>}
    </box>
  )
}

function VariableField({
  label,
  value,
  placeholder,
  focused,
  env,
  theme,
  onFocus,
  onChange,
  inputRef,
}: {
  label: string
  value: string
  placeholder: string
  focused: boolean
  env: Environment | null
  theme: ReturnType<typeof useTheme>
  onFocus: () => void
  onChange: (value: string) => void
  inputRef: { current: VarInputHandle | null }
}) {
  return (
    <box style={{ flexDirection: "column" }}>
      <text fg={theme.textMuted}>{label}</text>
      <VarInput
        ref={inputRef}
        value={value}
        env={env}
        isEditing
        isFocused={focused}
        onChange={onChange}
        placeholder={placeholder}
        backgroundColor={theme.backgroundElement}
        focusedBackgroundColor={theme.borderSubtle}
        onFocus={onFocus}
      />
    </box>
  )
}

function FooterAction({
  keyHint,
  label,
  hovered,
  theme,
  onHover,
  onLeave,
  onClick,
}: {
  keyHint: string
  label: string
  hovered: boolean
  theme: ReturnType<typeof useTheme>
  onHover: () => void
  onLeave: () => void
  onClick?: () => void
}) {
  return (
    <box
      onMouseDown={(event) => {
        if (event.button !== MouseButton.LEFT) return
        onClick?.()
        event.preventDefault()
        event.stopPropagation()
      }}
      onMouseOver={onHover}
      onMouseOut={onLeave}
      style={{
        flexDirection: "row",
        paddingLeft: 1,
        paddingRight: 1,
        backgroundColor: hovered ? theme.backgroundElement : undefined,
      }}
    >
      <text fg={theme.text}>{keyHint}</text>
      <text fg={theme.textMuted}> {label}</text>
    </box>
  )
}
