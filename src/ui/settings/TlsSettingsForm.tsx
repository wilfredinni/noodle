import { MouseButton } from "@opentui/core"
import { useKeymap } from "@opentui/keymap/react"
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import type {
  ClientCertificateProfile,
  CollectionTlsSettings,
  Environment,
} from "../../schema"
import { isValidTlsHost } from "../../tls"
import { isVariableReference } from "../../variableReference"
import { Checkbox } from "../Checkbox"
import { LeftBar } from "../borders"
import { VarInput } from "../VarInput"
import { useTheme } from "../theme"
import { SettingsField } from "./SettingsField"

const PROFILE_FIELD_COUNT = 7
const ADD_PROFILE_FIELD = 2
const PROFILE_START_FIELD = 3

export function TlsSettingsForm({
  settings,
  activeEnv,
  focused,
  insecure,
  collectionDir,
  onChange,
  onExit,
  onTextInputFocusChange,
}: {
  settings?: CollectionTlsSettings
  activeEnv: Environment | null
  focused: boolean
  insecure: boolean
  collectionDir: string
  onChange: (settings: CollectionTlsSettings) => boolean
  onExit: () => void
  onTextInputFocusChange?: (focused: boolean) => void
}) {
  const theme = useTheme()
  const keymap = useKeymap()
  const profiles = settings?.clientCertificates ?? []
  const [field, setField] = useState(0)
  const fieldCount =
    profiles.length === 0
      ? ADD_PROFILE_FIELD + 1
      : PROFILE_START_FIELD + profiles.length * PROFILE_FIELD_COUNT + 1

  useEffect(() => {
    setField((current) => Math.min(current, fieldCount - 1))
  }, [fieldCount])

  const isTextField = useMemo(() => {
    if (field === 1) return true
    if (field < PROFILE_START_FIELD || field === fieldCount - 1) return false
    const offset = (field - PROFILE_START_FIELD) % PROFILE_FIELD_COUNT
    return offset >= 1 && offset <= 5
  }, [field, fieldCount])

  useEffect(() => {
    onTextInputFocusChange?.(focused && isTextField)
    return () => onTextInputFocusChange?.(false)
  }, [focused, isTextField, onTextInputFocusChange])

  const save = useCallback(
    (patch: Partial<CollectionTlsSettings>) =>
      onChange({ ...(settings ?? {}), ...patch }),
    [onChange, settings],
  )

  const updateProfile = useCallback(
    (index: number, patch: Partial<ClientCertificateProfile>) => {
      const next = profiles.map((profile, current) =>
        current === index ? { ...profile, ...patch } : profile,
      )
      const candidate = next[index]
      if (
        candidate?.enabled !== false &&
        (!isValidTlsHost(candidate?.host ?? "") ||
          !candidate.certFile.trim() ||
          !candidate.keyFile.trim())
      ) {
        next[index] = { ...candidate, enabled: false }
      }
      return save({ clientCertificates: next })
    },
    [profiles, save],
  )

  const addProfile = useCallback(() => {
    const next = [
      ...profiles,
      { host: "", certFile: "", keyFile: "", enabled: false },
    ]
    if (save({ clientCertificates: next })) {
      setField(profiles.length === 0 ? PROFILE_START_FIELD : fieldCount - 1)
    }
  }, [fieldCount, profiles, save])

  const removeProfile = useCallback(
    (index: number) => {
      save({ clientCertificates: profiles.filter((_, i) => i !== index) })
    },
    [profiles, save],
  )

  useEffect(() => {
    if (!focused) return
    const dispose = keymap.intercept(
      "key",
      (ctx) => {
        if (keymap.getData("app.overlay") !== "none") return
        const event = ctx.event
        if (event.name === "escape") {
          event.preventDefault()
          event.stopPropagation()
          onExit()
          return
        }
        if (["up", "down", "home", "end"].includes(event.name)) {
          event.preventDefault()
          event.stopPropagation()
          const next =
            event.name === "home"
              ? 0
              : event.name === "end"
                ? fieldCount - 1
                : Math.min(
                    fieldCount - 1,
                    Math.max(0, field + (event.name === "up" ? -1 : 1)),
                  )
          setField(next)
          return
        }
        if (event.name === "tab") {
          event.preventDefault()
          event.stopPropagation()
          const next = field + (event.shift ? -1 : 1)
          if (next < 0 || next >= fieldCount) onExit()
          else setField(next)
          return
        }
        if (event.name !== "return" && event.name !== "space") return
        if (field === 0) {
          event.preventDefault()
          event.stopPropagation()
          save({ verify: !(settings?.verify ?? true) })
          return
        }
        if (
          field === ADD_PROFILE_FIELD ||
          (profiles.length > 0 && field === fieldCount - 1)
        ) {
          event.preventDefault()
          event.stopPropagation()
          addProfile()
          return
        }
        if (field < PROFILE_START_FIELD) return
        const profileIndex = Math.floor(
          (field - PROFILE_START_FIELD) / PROFILE_FIELD_COUNT,
        )
        const offset = (field - PROFILE_START_FIELD) % PROFILE_FIELD_COUNT
        const profile = profiles[profileIndex]
        if (!profile) return
        if (offset === 0) {
          event.preventDefault()
          event.stopPropagation()
          const complete =
            isValidTlsHost(profile.host) &&
            profile.certFile.trim() &&
            profile.keyFile.trim()
          if (complete || profile.enabled !== false) {
            updateProfile(profileIndex, {
              enabled: !(profile.enabled !== false),
            })
          }
        } else if (offset === 6) {
          event.preventDefault()
          event.stopPropagation()
          removeProfile(profileIndex)
        }
      },
      { priority: 100 },
    )
    return dispose
  }, [
    addProfile,
    field,
    fieldCount,
    focused,
    keymap,
    onExit,
    profiles,
    removeProfile,
    save,
    settings?.verify,
    updateProfile,
  ])

  return (
    <box style={{ flexDirection: "column", gap: 1 }}>
      {insecure && (
        <text fg={theme.warning} wrapMode="word">
          TLS verification is disabled for this session by --insecure. Saved
          settings still apply next time.
        </text>
      )}
      <FieldLabel
        id="settings-tls-verify"
        title="TLS certificates"
        description="Reject servers whose certificate or hostname cannot be verified."
        active={focused && field === 0}
        onMouseDown={() => {
          setField(0)
          save({ verify: !(settings?.verify ?? true) })
        }}
      >
        <Checkbox checked={settings?.verify ?? true} theme={theme} />
        <text fg={focused && field === 0 ? theme.primary : theme.text}>
          Verify TLS certificates
        </text>
      </FieldLabel>
      <FieldLabel
        id="settings-tls-ca-bundle"
        title="CA bundle (optional)"
        description="Optional. PEM bundle that replaces the default trusted roots. Relative paths resolve from the collection."
        active={focused && field === 1}
      >
        <VarInput
          value={settings?.caBundle ?? ""}
          env={null}
          isEditing
          isFocused={focused && field === 1}
          onChange={(value) => save({ caBundle: value || undefined })}
          onFocus={() => setField(1)}
          pathCompletion={{ kind: "file", relativeRoot: collectionDir }}
          placeholder="./certs/internal-roots.pem"
          backgroundColor="transparent"
          focusedBackgroundColor="transparent"
          style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0 }}
        />
      </FieldLabel>

      <box style={{ flexDirection: "column", gap: 0 }}>
        <text fg={theme.text} attributes={1}>
          Client certificates ({profiles.length})
        </text>
        <text fg={theme.textMuted} wrapMode="word">
          Optional. Add a certificate and private-key pair per host and port;
          the first enabled match wins.
        </text>
      </box>
      <AddCertificateButton
        id="settings-tls-add-top"
        active={focused && field === ADD_PROFILE_FIELD}
        onClick={() => {
          setField(ADD_PROFILE_FIELD)
          addProfile()
        }}
      />
      {profiles.map((profile, index) => {
        const base = PROFILE_START_FIELD + index * PROFILE_FIELD_COUNT
        const complete = Boolean(
          isValidTlsHost(profile.host) &&
          profile.certFile.trim() &&
          profile.keyFile.trim(),
        )
        return (
          <box
            key={index}
            id={`settings-tls-profile-${index}`}
            border={[...LeftBar.border]}
            customBorderChars={LeftBar.customBorderChars}
            borderColor={
              focused && field >= base && field <= base + 6
                ? theme.primary
                : theme.borderSubtle
            }
            style={{
              flexDirection: "column",
              gap: 0,
              marginLeft: 2,
              minWidth: 0,
            }}
          >
            <SettingsField
              title={`Certificate ${index + 1}`}
              description={
                complete
                  ? "Exact host and port match; the first enabled certificate wins."
                  : "Enter a bare host and complete the fields below to enable this certificate."
              }
              border={false}
              active={focused && field === base}
              onMouseDown={() => {
                setField(base)
                if (complete || profile.enabled !== false) {
                  updateProfile(index, { enabled: profile.enabled === false })
                }
              }}
            >
              <Checkbox checked={profile.enabled !== false} theme={theme} />
              <text
                fg={profile.enabled !== false ? theme.success : theme.textMuted}
              >
                {profile.enabled !== false ? " enabled" : " disabled"}
              </text>
            </SettingsField>
            <TextInput
              title="Host"
              description="Required. Bare hostname matched exactly for this certificate."
              border={false}
              value={profile.host}
              placeholder="api.internal.example"
              focused={focused && field === base + 1}
              onFocus={() => setField(base + 1)}
              onChange={(host) => updateProfile(index, { host })}
            />
            <TextInput
              title="Port (optional)"
              description="Optional. Port matched with the host; blank uses 443."
              border={false}
              value={profile.port === undefined ? "" : String(profile.port)}
              placeholder="443"
              focused={focused && field === base + 2}
              onFocus={() => setField(base + 2)}
              onChange={(value) => {
                if (value === "") updateProfile(index, { port: undefined })
                else if (/^\d+$/.test(value)) {
                  const port = Number(value)
                  if (port >= 1 && port <= 65535) updateProfile(index, { port })
                }
              }}
            />
            <PathInput
              title="Certificate chain"
              description="Required. PEM certificate chain used for client authentication."
              border={false}
              value={profile.certFile}
              placeholder="./certs/client-chain.pem"
              focused={focused && field === base + 3}
              activeEnv={null}
              collectionDir={collectionDir}
              onFocus={() => setField(base + 3)}
              onChange={(certFile) => updateProfile(index, { certFile })}
            />
            <PathInput
              title="Private key"
              description="Required. Private key paired with the certificate chain."
              border={false}
              value={profile.keyFile}
              placeholder="./certs/client-key.pem"
              focused={focused && field === base + 4}
              activeEnv={null}
              collectionDir={collectionDir}
              onFocus={() => setField(base + 4)}
              onChange={(keyFile) => updateProfile(index, { keyFile })}
            />
            <PassphraseInput
              title="Passphrase (optional)"
              description="Optional. Use $VARNAME for an environment value."
              border={false}
              value={profile.passphrase ?? ""}
              placeholder="$MTLS_PASSPHRASE"
              focused={focused && field === base + 5}
              activeEnv={activeEnv}
              onFocus={() => setField(base + 5)}
              onChange={(passphrase) =>
                updateProfile(index, { passphrase: passphrase || undefined })
              }
            />
            <RemoveCertificateButton
              id={`settings-tls-remove-${index}`}
              active={focused && field === base + 6}
              onClick={() => {
                setField(base + 6)
                removeProfile(index)
              }}
            />
          </box>
        )
      })}
      {profiles.length > 0 && (
        <AddCertificateButton
          id="settings-tls-add-bottom"
          active={focused && field === fieldCount - 1}
          onClick={() => {
            setField(fieldCount - 1)
            addProfile()
          }}
        />
      )}
    </box>
  )
}

function PassphraseInput({
  title,
  description,
  border,
  value,
  placeholder,
  focused,
  activeEnv,
  onFocus,
  onChange,
}: {
  title: string
  description: string
  border: boolean
  value: string
  placeholder: string
  focused: boolean
  activeEnv: Environment | null
  onFocus: () => void
  onChange: (value: string) => void
}) {
  const [draft, setDraft] = useState(value)
  const [error, setError] = useState<string>()

  useEffect(() => {
    setDraft(value)
    setError(undefined)
  }, [focused, value])

  return (
    <SettingsField
      title={title}
      description={description}
      error={error}
      border={border}
      active={focused}
    >
      <VarInput
        value={draft}
        env={activeEnv}
        isEditing
        isFocused={focused}
        onChange={(next) => {
          setDraft(next)
          if (next === "" || isVariableReference(next)) {
            setError(undefined)
            onChange(next)
          } else {
            setError("Use an exact $VARNAME reference; literals are not saved.")
          }
        }}
        onFocus={onFocus}
        placeholder={placeholder}
        backgroundColor="transparent"
        focusedBackgroundColor="transparent"
        paddingX={0}
        style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0 }}
      />
    </SettingsField>
  )
}

function AddCertificateButton({
  id,
  active,
  onClick,
}: {
  id: string
  active: boolean
  onClick: () => void
}) {
  const theme = useTheme()
  const [hovered, setHovered] = useState(false)
  return (
    <box
      id={id}
      border={[...LeftBar.border]}
      customBorderChars={LeftBar.customBorderChars}
      borderColor={active ? theme.primary : theme.borderSubtle}
      style={{
        width: "100%",
        minWidth: 0,
        backgroundColor:
          active || hovered ? theme.backgroundElement : undefined,
      }}
      onMouseDown={(event) => {
        if (event.button !== MouseButton.LEFT) return
        onClick()
        event.stopPropagation()
      }}
      onMouseOver={() => setHovered(true)}
      onMouseOut={() => setHovered(false)}
    >
      <text fg={theme.primary} attributes={active || hovered ? 1 : 0}>
        + Add client certificate
      </text>
    </box>
  )
}

function RemoveCertificateButton({
  id,
  active,
  onClick,
}: {
  id: string
  active: boolean
  onClick: () => void
}) {
  const theme = useTheme()
  const [hovered, setHovered] = useState(false)
  const emphasized = active || hovered
  return (
    <box
      id={id}
      style={{
        width: "100%",
        minWidth: 0,
        backgroundColor: emphasized ? theme.backgroundElement : undefined,
      }}
      onMouseDown={(event) => {
        if (event.button !== MouseButton.LEFT) return
        onClick()
        event.stopPropagation()
      }}
      onMouseOver={() => setHovered(true)}
      onMouseOut={() => setHovered(false)}
    >
      <text fg={theme.error}>Remove certificate</text>
    </box>
  )
}

function FieldLabel({
  id,
  title,
  description,
  active,
  onMouseDown,
  children,
}: {
  id?: string
  title: string
  description: string
  active?: boolean
  onMouseDown?: () => void
  children: ReactNode
}) {
  return (
    <SettingsField
      id={id}
      title={title}
      description={description}
      active={active}
      onMouseDown={onMouseDown}
    >
      {children}
    </SettingsField>
  )
}

function TextInput({
  title,
  description,
  border = true,
  value,
  placeholder,
  focused,
  onFocus,
  onChange,
}: {
  title: string
  description?: string
  border?: boolean
  value: string
  placeholder: string
  focused: boolean
  onFocus: () => void
  onChange: (value: string) => void
}) {
  const theme = useTheme()
  return (
    <SettingsField
      title={title}
      description={description}
      border={border}
      active={focused}
    >
      <box
        style={{
          flexGrow: 1,
          minWidth: 0,
          height: 1,
          overflow: "hidden",
        }}
        onMouseDown={onFocus}
      >
        <input
          value={value}
          placeholder={placeholder}
          focused={focused}
          onInput={onChange}
          backgroundColor="transparent"
          focusedBackgroundColor="transparent"
          textColor={theme.text}
          cursorColor={theme.primary}
          placeholderColor={theme.textMuted}
          paddingX={0}
          style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0 }}
        />
      </box>
    </SettingsField>
  )
}

function PathInput({
  title,
  description,
  border = true,
  value,
  placeholder,
  focused,
  activeEnv,
  collectionDir,
  pathCompletion = true,
  onFocus,
  onChange,
}: {
  title: string
  description?: string
  border?: boolean
  value: string
  placeholder: string
  focused: boolean
  activeEnv: Environment | null
  collectionDir: string
  pathCompletion?: boolean
  onFocus: () => void
  onChange: (value: string) => void
}) {
  return (
    <SettingsField
      title={title}
      description={description}
      border={border}
      active={focused}
    >
      <VarInput
        value={value}
        env={activeEnv}
        isEditing
        isFocused={focused}
        onChange={onChange}
        onFocus={onFocus}
        pathCompletion={
          pathCompletion
            ? { kind: "file", relativeRoot: collectionDir }
            : undefined
        }
        placeholder={placeholder}
        backgroundColor="transparent"
        focusedBackgroundColor="transparent"
        paddingX={0}
        style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0 }}
      />
    </SettingsField>
  )
}
