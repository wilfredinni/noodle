import { MouseButton, type InputRenderable } from "@opentui/core"
import { useKeymap } from "@opentui/keymap/react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type {
  AppProxySettings,
  CollectionProxySettings,
  ProxyCredentials,
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
import { useTheme } from "../theme"
import { SettingsField } from "./SettingsField"
import { SecretInput } from "./SecretInput"

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
  auth: boolean
  url: string
  bypass: string
}

function proxyErrorField(
  message: string | null,
  editor: EditorMode,
): Field | null {
  if (!message) return null
  if (message.startsWith("Proxy hostname")) return "hostname"
  if (message.startsWith("Proxy port")) return "port"
  if (message.startsWith("Username")) return "username"
  if (message.startsWith("Password")) return "password"
  if (message.startsWith("This URL needs Advanced mode")) return "editor"
  if (message.startsWith("Proxy URL")) {
    return editor === "advanced" ? "proxy-url" : "hostname"
  }
  return null
}

const EMPTY_FIELDS: StructuredProxyFields = {
  protocol: "http",
  hostname: "",
  port: "",
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
      auth: false,
      url: "",
      bypass: "",
    }
  }
  if (proxy.mode === "off") {
    return {
      mode: "off",
      editor: "fields",
      fields: EMPTY_FIELDS,
      auth: false,
      url: "",
      bypass: "",
    }
  }
  const fields = parseStructuredProxyTemplate(proxy.url)
  return {
    mode: "custom",
    editor: fields ? "fields" : "advanced",
    fields: fields ?? EMPTY_FIELDS,
    auth: proxy.auth === true,
    url: proxy.url,
    bypass: (proxy.bypass ?? []).join(", "),
  }
}

export function ProxySettingsForm({
  scope,
  proxy,
  credentials = {},
  focused,
  noProxy = false,
  onChange,
  onCredentialsChange = async () => false,
  onAuthDisable = async () => false,
  onExit,
  onFieldFocus,
  onTextInputFocusChange,
}: {
  scope: "app" | "collection"
  proxy?: AppProxySettings | CollectionProxySettings
  credentials?: ProxyCredentials
  focused: boolean
  noProxy?: boolean
  onChange: (proxy: AppProxySettings | CollectionProxySettings) => boolean
  onCredentialsChange?: (credentials: ProxyCredentials) => Promise<boolean>
  onAuthDisable?: () => Promise<boolean>
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
  const [usernameDraft, setUsernameDraft] = useState<string>()
  const [selectOpen, setSelectOpen] = useState(false)
  const hostnameRef = useRef<InputRenderable | null>(null)
  const portRef = useRef<InputRenderable | null>(null)
  const urlRef = useRef<InputRenderable | null>(null)
  const bypassRef = useRef<InputRenderable | null>(null)
  const lastPublishedRef = useRef<string | null>(null)
  const savedCredentialsRef = useRef(credentials)
  const credentialSaveChainRef = useRef<Promise<void>>(Promise.resolve())
  const pendingCredentialSavesRef = useRef(0)
  const disablingAuthRef = useRef(false)
  const proxyFingerprint = `${scope}:${JSON.stringify(proxy)}`
  const proxyRef = useRef(proxy)
  proxyRef.current = proxy
  const credentialFingerprint = JSON.stringify(credentials)

  useEffect(() => {
    if (pendingCredentialSavesRef.current === 0) {
      savedCredentialsRef.current = credentials
    }
  }, [credentialFingerprint, credentials])

  useEffect(() => {
    if (lastPublishedRef.current === proxyFingerprint) return
    const next = valuesFor(proxyRef.current, fallback)
    valuesRef.current = next
    setValues(next)
    setError(null)
  }, [fallback, proxyFingerprint])

  const focusOrder = useMemo<Field[]>(
    () =>
      values.mode !== "custom"
        ? ["mode"]
        : values.editor === "advanced"
          ? [
              "mode",
              "editor",
              "proxy-url",
              "bypass",
              "auth",
              ...(values.auth ? (["username", "password"] as const) : []),
            ]
          : [
              "mode",
              "editor",
              "protocol",
              "hostname",
              "port",
              "bypass",
              "auth",
              ...(values.auth ? (["username", "password"] as const) : []),
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
      const persistedAuth =
        proxyRef.current?.mode === "custom" && proxyRef.current.auth === true
      const output: AppProxySettings | CollectionProxySettings = {
        mode: "custom",
        url,
        ...(bypass.length > 0 ? { bypass } : {}),
        ...(next.auth && (persistedAuth || credentials.username)
          ? { auth: true }
          : {}),
      }
      if (!onChange(output)) return "failed"
      lastPublishedRef.current = `${scope}:${JSON.stringify(output)}`
      return "saved"
    },
    [credentials.username, onChange, scope],
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

  const saveCredentials = useCallback(
    (patch: Partial<ProxyCredentials>) => {
      pendingCredentialSavesRef.current++
      const pending = credentialSaveChainRef.current.then(async () => {
        const next = { ...savedCredentialsRef.current, ...patch }
        const saved = await onCredentialsChange(next)
        if (saved) savedCredentialsRef.current = next
        return saved
      })
      credentialSaveChainRef.current = pending.then(
        () => {},
        () => {},
      )
      void pending.then(
        () => pendingCredentialSavesRef.current--,
        () => pendingCredentialSavesRef.current--,
      )
      return pending
    },
    [onCredentialsChange],
  )

  const disableAuth = useCallback(async () => {
    if (disablingAuthRef.current) return false
    disablingAuthRef.current = true
    const current = valuesRef.current
    const disabled = {
      ...current,
      auth: false,
    }
    valuesRef.current = disabled
    setValues(disabled)
    setUsernameDraft(undefined)
    setError(null)
    try {
      const stored = proxyRef.current
      if (
        pendingCredentialSavesRef.current === 0 &&
        (stored?.mode !== "custom" || stored.auth !== true)
      ) {
        return true
      }
      await credentialSaveChainRef.current
      const saved = await onAuthDisable()
      if (saved) {
        savedCredentialsRef.current = {}
        return true
      }
      const latest = valuesRef.current
      const restored = {
        ...latest,
        auth: true,
      }
      valuesRef.current = restored
      setValues(restored)
      setError("Could not disable proxy authentication")
      return false
    } catch (error) {
      const latest = valuesRef.current
      const restored = {
        ...latest,
        auth: true,
      }
      valuesRef.current = restored
      setValues(restored)
      setError(error instanceof Error ? error.message : String(error))
      return false
    } finally {
      disablingAuthRef.current = false
    }
  }, [onAuthDisable])

  const switchEditor = useCallback(
    (editor: EditorMode) => {
      if (editor === values.editor) return
      if (editor === "fields") {
        const fields = parseStructuredProxyTemplate(values.url)
        if (!fields) {
          if (values.url.trim()) {
            setError(
              "This URL needs Advanced mode. The fields editor supports an HTTP(S) host, optional port, and optional credentials.",
            )
            return
          }
          update({ editor }, false)
          setError(null)
        } else {
          update({
            editor,
            fields,
          })
        }
      } else {
        const result = buildStructuredProxyTemplate(values.fields)
        if ("error" in result) {
          update({ editor }, false)
          setError(null)
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
        if (["up", "down", "home", "end"].includes(ctx.event.name)) {
          ctx.event.preventDefault()
          ctx.event.stopPropagation()
          const index = focusOrder.indexOf(field)
          const next =
            ctx.event.name === "home"
              ? 0
              : ctx.event.name === "end"
                ? focusOrder.length - 1
                : Math.min(
                    focusOrder.length - 1,
                    Math.max(0, index + (ctx.event.name === "up" ? -1 : 1)),
                  )
          setField(focusOrder[next]!)
        } else if (ctx.event.name === "tab") {
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
        } else if (
          (ctx.event.name === "space" || ctx.event.name === "return") &&
          field === "auth"
        ) {
          ctx.event.preventDefault()
          ctx.event.stopPropagation()
          if (values.auth) {
            void disableAuth()
          } else {
            update({ auth: true }, Boolean(credentials.username))
          }
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
    disableAuth,
    selectOpen,
    update,
    credentials.username,
    values.auth,
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

  useEffect(() => {
    setUsernameDraft(undefined)
  }, [credentials.username, proxyFingerprint])
  const credentialDescription =
    "Credentials are stored securely and are revealed only while focused."
  const advancedCredentialDescription =
    "Enter only the proxy URL here. Configure credentials with the secret fields below."

  const displayedError =
    values.auth && !(usernameDraft ?? credentials.username)
      ? "Username is required when proxy authentication is enabled"
      : error
  const errorField = proxyErrorField(displayedError, values.editor)
  const fieldError = (target: Field) =>
    errorField === target ? (displayedError ?? undefined) : undefined

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
        hint={
          scope === "app"
            ? "Choose the system proxy, a custom proxy, or direct connections."
            : "Inherit the app proxy, configure a custom proxy, or use direct connections."
        }
        items={modeItems}
        value={values.mode}
        focused={focused && field === "mode"}
        onOpenChange={setSelectOpen}
        onActivate={() => setField("mode")}
        onChange={(mode) => {
          const nextMode = mode as ProxyMode
          if (
            values.mode === "custom" &&
            nextMode !== "custom" &&
            values.auth
          ) {
            void disableAuth().then((saved) => {
              if (saved) update({ mode: nextMode })
            })
          } else update({ mode: nextMode })
        }}
      />
      {values.mode === "custom" && (
        <>
          <SelectField
            id="settings-proxy-editor"
            label="Editor"
            hint="Use structured fields or enter the complete proxy URL."
            items={[
              { id: "fields", label: "Fields" },
              { id: "advanced", label: "Advanced URL" },
            ]}
            value={values.editor}
            focused={focused && field === "editor"}
            error={fieldError("editor")}
            onOpenChange={setSelectOpen}
            onActivate={() => setField("editor")}
            onChange={(value) => switchEditor(value as EditorMode)}
          />
          {values.editor === "fields" ? (
            <>
              <SelectField
                id="settings-proxy-protocol"
                label="Protocol"
                hint="Protocol used to connect to the proxy server."
                items={[
                  { id: "http", label: "HTTP" },
                  { id: "https", label: "HTTPS" },
                ]}
                value={values.fields.protocol}
                focused={focused && field === "protocol"}
                error={fieldError("protocol")}
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
                hint="Hostname or IP address of the proxy server."
                focused={focused && field === "hostname"}
                error={fieldError("hostname")}
                onFocus={() => setField("hostname")}
                onChange={(hostname) => updateFields({ hostname })}
              />
              <TextField
                id="settings-proxy-port"
                label="Port (optional)"
                inputRef={portRef}
                value={values.fields.port}
                placeholder="optional"
                hint="Optional. Uses the protocol default when empty."
                focused={focused && field === "port"}
                error={fieldError("port")}
                onFocus={() => setField("port")}
                onChange={(port) => updateFields({ port })}
              />
            </>
          ) : (
            <TextField
              id="settings-proxy-proxy-url"
              label="Proxy URL"
              inputRef={urlRef}
              value={values.url}
              placeholder="http://proxy.example:8080"
              focused={focused && field === "proxy-url"}
              error={fieldError("proxy-url")}
              hint={advancedCredentialDescription}
              onFocus={() => setField("proxy-url")}
              onChange={(url) => update({ url }, false)}
            />
          )}
          <TextField
            id="settings-proxy-bypass"
            label="Bypass hosts (optional)"
            inputRef={bypassRef}
            value={values.bypass}
            placeholder="localhost, .internal.example, api.example:8443"
            focused={focused && field === "bypass"}
            onFocus={() => setField("bypass")}
            onChange={(bypass) => update({ bypass })}
            hint="Optional. Comma-separated; supports *, hosts, .domains, IPs, and ports."
          />
          <>
            <SettingsField
              id="settings-proxy-auth"
              title="Proxy authentication (optional)"
              description={credentialDescription}
              active={focused && field === "auth"}
              onMouseDown={() => {
                setField("auth")
                if (values.auth) {
                  void disableAuth()
                } else {
                  update({ auth: true }, Boolean(credentials.username))
                }
              }}
            >
              <Checkbox checked={values.auth} theme={theme} />
            </SettingsField>
            {values.auth && (
              <>
                <SecretField
                  id="settings-proxy-username"
                  label="Username"
                  value={credentials.username}
                  hasValue={Boolean(credentials.username)}
                  placeholder="username"
                  hint="Required when proxy authentication is enabled."
                  focused={focused && field === "username"}
                  error={fieldError("username")}
                  onFocus={() => setField("username")}
                  onDraftChange={setUsernameDraft}
                  onCommit={async (username) => {
                    if (!username) {
                      setError(
                        "Proxy username is required when authentication is enabled",
                      )
                      return false
                    }
                    return saveCredentials({
                      username,
                    })
                  }}
                  onError={(message) => setError(message ?? null)}
                />
                <SecretField
                  id="settings-proxy-password"
                  label="Password (optional)"
                  value={credentials.password}
                  hasValue={Boolean(credentials.password)}
                  placeholder="optional"
                  hint="Optional. Clear the field to delete the stored password."
                  focused={focused && field === "password"}
                  error={fieldError("password")}
                  onFocus={() => setField("password")}
                  onCommit={(password) =>
                    saveCredentials({
                      password: password || undefined,
                    })
                  }
                  onError={(message) => setError(message ?? null)}
                />
              </>
            )}
          </>
        </>
      )}
      {displayedError && !errorField && (
        <text fg={theme.error}>{displayedError}</text>
      )}
    </box>
  )
}

function SecretField({
  id,
  label,
  value,
  hasValue,
  placeholder,
  focused,
  onFocus,
  onCommit,
  onDraftChange,
  onError,
  hint,
  error,
}: {
  id: string
  label: string
  value?: string
  hasValue?: boolean
  placeholder: string
  focused: boolean
  onFocus: () => void
  onCommit: (value: string) => Promise<boolean>
  onDraftChange?: (value: string) => void
  onError: (message?: string) => void
  hint?: string
  error?: string
}) {
  return (
    <SettingsField
      id={id}
      title={label}
      active={focused}
      description={hint}
      error={error}
    >
      <box style={{ flexGrow: 1, minWidth: 0, height: 1, overflow: "hidden" }}>
        <SecretInput
          value={value}
          hasValue={hasValue}
          focused={focused}
          placeholder={placeholder}
          onFocus={onFocus}
          onCommit={onCommit}
          onDraftChange={onDraftChange}
          onError={onError}
        />
      </box>
    </SettingsField>
  )
}

function SelectField({
  id,
  label,
  items,
  value,
  focused,
  hint,
  error,
  onOpenChange,
  onActivate,
  onChange,
}: {
  id: string
  label: string
  items: SelectItem[]
  value: string
  focused: boolean
  hint?: string
  error?: string
  onOpenChange: (open: boolean) => void
  onActivate: () => void
  onChange: (value: string) => void
}) {
  return (
    <SettingsField
      id={id}
      title={label}
      description={hint}
      error={error}
      active={focused}
    >
      <Select
        items={items}
        value={value}
        fitContent
        onChange={onChange}
        focused={focused}
        onOpenChange={onOpenChange}
        onActivate={onActivate}
        triggerPriority={110}
      />
    </SettingsField>
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
  error,
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
  error?: string
  inputRef: { current: InputRenderable | null }
}) {
  const theme = useTheme()
  return (
    <SettingsField
      id={id}
      title={label}
      active={focused}
      description={hint}
      error={error}
    >
      <box style={{ flexGrow: 1, minWidth: 0, height: 1, overflow: "hidden" }}>
        <input
          ref={inputRef}
          value={value}
          placeholder={placeholder}
          onInput={onChange}
          onMouseDown={(event) => {
            if (event.button === MouseButton.LEFT) onFocus()
          }}
          focused={focused}
          backgroundColor="transparent"
          focusedBackgroundColor="transparent"
          textColor={theme.text}
          cursorColor={theme.primary}
          placeholderColor={theme.textMuted}
          style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0 }}
        />
      </box>
    </SettingsField>
  )
}
