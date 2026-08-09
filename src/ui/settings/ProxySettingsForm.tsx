import { MouseButton, type InputRenderable } from "@opentui/core"
import { useKeymap } from "@opentui/keymap/react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
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

type EditorMode = "fields" | "advanced"
type ProxyMode = "system" | "inherit" | "custom" | "off"
type Field =
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

interface FormValues {
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
): FormValues {
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

export function ProxySettingsForm({
  scope,
  proxy,
  activeEnv,
  focused,
  noProxy = false,
  onChange,
  onExit,
  onFieldFocus,
  onTextInputFocusChange,
}: {
  scope: "app" | "collection"
  proxy?: AppProxySettings | CollectionProxySettings
  activeEnv?: Environment | null
  focused: boolean
  noProxy?: boolean
  onChange: (proxy: AppProxySettings | CollectionProxySettings) => boolean
  onExit?: () => void
  onFieldFocus?: (field: Field) => void
  onTextInputFocusChange?: (active: boolean) => void
}) {
  const theme = useTheme()
  const keymap = useKeymap()
  const fallback = scope === "app" ? "system" : "inherit"
  const [values, setValues] = useState(() => valuesFor(proxy, fallback))
  const valuesRef = useRef(values)
  valuesRef.current = values
  const [field, setField] = useState<Field>("mode")
  const [error, setError] = useState<string | null>(null)
  const [selectOpen, setSelectOpen] = useState(false)
  const hostnameRef = useRef<InputRenderable | null>(null)
  const portRef = useRef<InputRenderable | null>(null)
  const usernameRef = useRef<VarInputHandle | null>(null)
  const passwordRef = useRef<VarInputHandle | null>(null)
  const urlRef = useRef<VarInputHandle | null>(null)
  const bypassRef = useRef<InputRenderable | null>(null)
  const lastPublishedRef = useRef<string | null>(null)
  const proxyFingerprint = `${scope}:${JSON.stringify(proxy)}`

  useEffect(() => {
    if (lastPublishedRef.current === proxyFingerprint) return
    const next = valuesFor(proxy, fallback)
    valuesRef.current = next
    setValues(next)
    setField("mode")
    setError(null)
  }, [fallback, proxy, proxyFingerprint])

  const focusOrder = useMemo<Field[]>(
    () =>
      values.mode !== "custom"
        ? ["mode"]
        : values.editor === "advanced"
          ? ["mode", "editor", "proxy-url", "bypass"]
          : [
              "mode",
              "editor",
              "protocol",
              "hostname",
              "port",
              "bypass",
              "auth",
              ...(values.fields.auth
                ? (["username", "password"] as const)
                : []),
            ],
    [values],
  )

  const publish = useCallback(
    (next: FormValues): "saved" | "invalid" | "failed" => {
      if (next.mode !== "custom") {
        setError(null)
        const output = { mode: next.mode } as
          AppProxySettings | CollectionProxySettings
        if (!onChange(output)) return "failed"
        lastPublishedRef.current = `${scope}:${JSON.stringify(output)}`
        return "saved"
      }
      let url = next.url.trim()
      if (next.editor === "fields") {
        const result = buildStructuredProxyTemplate(next.fields)
        if ("error" in result) {
          setError(result.error)
          return "invalid"
        }
        url = result.url
      } else {
        const validationError = validateProxyTemplate(url)
        if (validationError) {
          setError(validationError)
          return "invalid"
        }
      }
      setError(null)
      const bypass = normalizeBypass(next.bypass.split(","))
      const output: AppProxySettings | CollectionProxySettings =
        bypass.length > 0
          ? { mode: "custom", url, bypass }
          : { mode: "custom", url }
      if (!onChange(output)) return "failed"
      lastPublishedRef.current = `${scope}:${JSON.stringify(output)}`
      return "saved"
    },
    [onChange, scope],
  )

  const update = useCallback(
    (patch: Partial<FormValues>, persist = true) => {
      const current = valuesRef.current
      const next = { ...current, ...patch }
      valuesRef.current = next
      setValues(next)
      if (persist && publish(next) === "failed") {
        valuesRef.current = current
        setValues(current)
      }
    },
    [publish],
  )

  const commitCurrent = useCallback(() => {
    if (publish(valuesRef.current) !== "failed") return
    const stored = valuesFor(proxy, fallback)
    valuesRef.current = stored
    setValues(stored)
  }, [fallback, proxy, publish])

  const updateFields = useCallback(
    (patch: Partial<StructuredProxyFields>) => {
      const current = valuesRef.current
      const next = { ...current, fields: { ...current.fields, ...patch } }
      valuesRef.current = next
      setValues(next)
      if (publish(next) === "failed") {
        valuesRef.current = current
        setValues(current)
      }
    },
    [publish],
  )

  const switchEditor = useCallback(
    (editor: EditorMode) => {
      if (editor === values.editor) return
      if (editor === "fields") {
        const fields = parseStructuredProxyTemplate(values.url)
        if (!fields) {
          setError(
            "This URL needs Advanced mode. Use an HTTP(S) host, optional port, and $VARNAME credentials only.",
          )
          return
        }
        update({ editor, fields })
      } else {
        const result = buildStructuredProxyTemplate(values.fields)
        if ("error" in result) {
          setError(result.error)
          return
        }
        update({ editor, url: result.url })
      }
      setField("editor")
    },
    [update, values],
  )

  useEffect(() => {
    if (!focused || selectOpen) return
    const dispose = keymap.intercept(
      "key",
      (ctx) => {
        if (ctx.event.name === "tab") {
          ctx.event.preventDefault()
          ctx.event.stopPropagation()
          if (field === "proxy-url") commitCurrent()
          const index = focusOrder.indexOf(field)
          const direction = ctx.event.shift ? -1 : 1
          const next = index + direction
          if (next < 0 || next >= focusOrder.length) onExit?.()
          else setField(focusOrder[next]!)
        } else if (ctx.event.name === "return" && field === "proxy-url") {
          ctx.event.preventDefault()
          ctx.event.stopPropagation()
          commitCurrent()
        } else if (ctx.event.name === "space" && field === "auth") {
          ctx.event.preventDefault()
          ctx.event.stopPropagation()
          updateFields({ auth: !values.fields.auth })
        }
      },
      { priority: 100 },
    )
    return dispose
  }, [
    field,
    commitCurrent,
    focusOrder,
    focused,
    keymap,
    onExit,
    selectOpen,
    updateFields,
    values.fields.auth,
  ])

  useEffect(() => {
    if (!focused) return
    onFieldFocus?.(field)
    onTextInputFocusChange?.(
      [
        "hostname",
        "port",
        "username",
        "password",
        "proxy-url",
        "bypass",
      ].includes(field),
    )
    if (field === "hostname") hostnameRef.current?.focus()
    else if (field === "port") portRef.current?.focus()
    else if (field === "username") usernameRef.current?.focus()
    else if (field === "password") passwordRef.current?.focus()
    else if (field === "proxy-url") urlRef.current?.focus()
    else if (field === "bypass") bypassRef.current?.focus()
  }, [field, focused, onFieldFocus, onTextInputFocusChange])

  const modeItems: SelectItem[] =
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
        ]

  return (
    <box style={{ flexDirection: "column", gap: 1 }}>
      {noProxy && scope === "app" && (
        <text fg={theme.warning}>
          Proxy use is disabled for this session by --no-proxy. Saved changes
          apply next time.
        </text>
      )}
      <SelectField
        id="settings-proxy-mode"
        label="Mode"
        items={modeItems}
        value={values.mode}
        focused={focused && field === "mode"}
        selectOpen={selectOpen}
        onOpenChange={setSelectOpen}
        onActivate={() => setField("mode")}
        onChange={(mode) => update({ mode: mode as ProxyMode })}
      />
      {values.mode === "custom" && (
        <>
          <SelectField
            id="settings-proxy-editor"
            label="Editor"
            items={[
              { id: "fields", label: "Fields" },
              { id: "advanced", label: "Advanced URL" },
            ]}
            value={values.editor}
            focused={focused && field === "editor"}
            selectOpen={selectOpen}
            onOpenChange={setSelectOpen}
            onActivate={() => setField("editor")}
            onChange={(value) => switchEditor(value as EditorMode)}
          />
          {values.editor === "fields" ? (
            <>
              <SelectField
                id="settings-proxy-protocol"
                label="Protocol"
                items={[
                  { id: "http", label: "HTTP" },
                  { id: "https", label: "HTTPS" },
                ]}
                value={values.fields.protocol}
                focused={focused && field === "protocol"}
                selectOpen={selectOpen}
                onOpenChange={setSelectOpen}
                onActivate={() => setField("protocol")}
                onChange={(protocol) =>
                  updateFields({ protocol: protocol as "http" | "https" })
                }
              />
              <TextField
                id="settings-proxy-hostname"
                label="Hostname"
                inputRef={hostnameRef}
                value={values.fields.hostname}
                placeholder="proxy.example or ::1"
                focused={focused && field === "hostname"}
                onFocus={() => setField("hostname")}
                onChange={(hostname) => updateFields({ hostname })}
              />
              <TextField
                id="settings-proxy-port"
                label="Port"
                inputRef={portRef}
                value={values.fields.port}
                placeholder="optional"
                focused={focused && field === "port"}
                onFocus={() => setField("port")}
                onChange={(port) => updateFields({ port })}
              />
            </>
          ) : (
            <VariableField
              id="settings-proxy-proxy-url"
              label="Proxy URL"
              inputRef={urlRef}
              value={values.url}
              placeholder="http://$PROXY_USER:$PROXY_PASSWORD@proxy:8080"
              focused={focused && field === "proxy-url"}
              env={activeEnv ?? null}
              onFocus={() => setField("proxy-url")}
              onChange={(url) => update({ url }, false)}
            />
          )}
          <TextField
            id="settings-proxy-bypass"
            label="Bypass hosts"
            inputRef={bypassRef}
            value={values.bypass}
            placeholder="localhost, .internal.example, api.example:8443"
            focused={focused && field === "bypass"}
            onFocus={() => setField("bypass")}
            onChange={(bypass) => update({ bypass })}
            hint="Comma-separated. Supports *, hosts, .domains, IPs, and ports."
          />
          <box
            id="settings-proxy-auth"
            onMouseDown={(event) => {
              if (event.button !== MouseButton.LEFT) return
              setField("auth")
              updateFields({ auth: !values.fields.auth })
              event.preventDefault()
              event.stopPropagation()
            }}
            style={{ flexDirection: "row" }}
          >
            <Checkbox checked={values.fields.auth} theme={theme} />
            <text
              fg={focused && field === "auth" ? theme.text : theme.textMuted}
            >
              Proxy authentication
            </text>
          </box>
          {values.fields.auth && (
            <>
              <VariableField
                id="settings-proxy-username"
                label="Username variable"
                inputRef={usernameRef}
                value={values.fields.username}
                placeholder="$PROXY_USER"
                focused={focused && field === "username"}
                env={activeEnv ?? null}
                onFocus={() => setField("username")}
                onChange={(username) => updateFields({ username })}
              />
              <VariableField
                id="settings-proxy-password"
                label="Password variable"
                inputRef={passwordRef}
                value={values.fields.password}
                placeholder="$PROXY_PASSWORD"
                focused={focused && field === "password"}
                env={activeEnv ?? null}
                onFocus={() => setField("password")}
                onChange={(password) => updateFields({ password })}
              />
            </>
          )}
        </>
      )}
      {error && <text fg={theme.error}>{error}</text>}
    </box>
  )
}

function SelectField({
  id,
  label,
  items,
  value,
  focused,
  selectOpen,
  onOpenChange,
  onActivate,
  onChange,
}: {
  id: string
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
    <box
      id={id}
      style={{
        flexDirection: "column",
        width: "100%",
        zIndex: selectOpen ? 2 : 0,
      }}
    >
      <text fg={theme.text}>{label}</text>
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
  id,
  label,
  value,
  placeholder,
  focused,
  onFocus,
  onChange,
  hint,
  inputRef,
}: {
  id: string
  label: string
  value: string
  placeholder: string
  focused: boolean
  onFocus: () => void
  onChange: (value: string) => void
  hint?: string
  inputRef: { current: InputRenderable | null }
}) {
  const theme = useTheme()
  return (
    <box id={id} style={{ flexDirection: "column", width: "100%" }}>
      <text fg={theme.text}>{label}</text>
      <box style={{ width: "100%", height: 1, overflow: "hidden" }}>
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
          style={{ alignSelf: "stretch" }}
        />
      </box>
      {hint && <text fg={theme.textMuted}>{hint}</text>}
    </box>
  )
}

function VariableField({
  id,
  label,
  value,
  placeholder,
  focused,
  env,
  onFocus,
  onChange,
  inputRef,
}: {
  id: string
  label: string
  value: string
  placeholder: string
  focused: boolean
  env: Environment | null
  onFocus: () => void
  onChange: (value: string) => void
  inputRef: { current: VarInputHandle | null }
}) {
  const theme = useTheme()
  return (
    <box id={id} style={{ flexDirection: "column", width: "100%" }}>
      <text fg={theme.text}>{label}</text>
      <box style={{ width: "100%", height: 1, overflow: "hidden" }}>
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
    </box>
  )
}
