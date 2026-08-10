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
import { Checkbox } from "../Checkbox"
import { VarInput } from "../VarInput"
import { useTheme } from "../theme"

const PROFILE_FIELD_COUNT = 7

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
  const fieldCount = 3 + profiles.length * PROFILE_FIELD_COUNT

  useEffect(() => {
    setField((current) => Math.min(current, fieldCount - 1))
  }, [fieldCount])

  const isTextField = useMemo(() => {
    if (field === 1) return true
    if (field < 2 || field === fieldCount - 1) return false
    const offset = (field - 2) % PROFILE_FIELD_COUNT
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
    if (save({ clientCertificates: next })) setField(fieldCount - 1)
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
        if (field === fieldCount - 1) {
          event.preventDefault()
          event.stopPropagation()
          addProfile()
          return
        }
        if (field === 1) return
        const profileIndex = Math.floor((field - 2) / PROFILE_FIELD_COUNT)
        const offset = (field - 2) % PROFILE_FIELD_COUNT
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
        title="TLS certificates"
        description="Reject servers whose certificate or hostname cannot be verified."
      >
        <box
          style={{ flexDirection: "row" }}
          onMouseDown={(event) => {
            if (event.button !== MouseButton.LEFT) return
            setField(0)
            save({ verify: !(settings?.verify ?? true) })
            event.stopPropagation()
          }}
        >
          <Checkbox checked={settings?.verify ?? true} theme={theme} />
          <text fg={focused && field === 0 ? theme.primary : theme.text}>
            Verify TLS certificates
          </text>
        </box>
      </FieldLabel>
      <FieldLabel
        title="CA bundle"
        description="PEM bundle that replaces the default trusted roots. Relative paths resolve from the collection."
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
          backgroundColor={theme.backgroundElement}
          focusedBackgroundColor={theme.borderSubtle}
          paddingX={1}
        />
      </FieldLabel>

      <text fg={theme.text} attributes={1}>
        Client certificates
      </text>
      <text fg={theme.textMuted} wrapMode="word">
        PEM certificate chains and private keys are selected by exact host and
        port. The first enabled match wins.
      </text>
      {profiles.map((profile, index) => {
        const base = 2 + index * PROFILE_FIELD_COUNT
        const complete = Boolean(
          isValidTlsHost(profile.host) &&
          profile.certFile.trim() &&
          profile.keyFile.trim(),
        )
        return (
          <box
            key={index}
            style={{
              flexDirection: "column",
              gap: 1,
              paddingLeft: 1,
              paddingRight: 1,
              backgroundColor: theme.backgroundElement,
            }}
          >
            <box
              style={{ flexDirection: "row", gap: 1 }}
              onMouseDown={(event) => {
                if (event.button !== MouseButton.LEFT) return
                setField(base)
                if (complete || profile.enabled !== false) {
                  updateProfile(index, { enabled: profile.enabled === false })
                }
                event.stopPropagation()
              }}
            >
              <Checkbox checked={profile.enabled !== false} theme={theme} />
              <text fg={complete ? theme.text : theme.textMuted}>
                {complete
                  ? `Certificate ${index + 1}`
                  : "Use a bare host and complete fields to enable"}
              </text>
            </box>
            <TextInput
              title="Host"
              value={profile.host}
              placeholder="api.internal.example"
              focused={focused && field === base + 1}
              onFocus={() => setField(base + 1)}
              onChange={(host) => updateProfile(index, { host })}
            />
            <TextInput
              title="Port"
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
              value={profile.keyFile}
              placeholder="./certs/client-key.pem"
              focused={focused && field === base + 4}
              activeEnv={null}
              collectionDir={collectionDir}
              onFocus={() => setField(base + 4)}
              onChange={(keyFile) => updateProfile(index, { keyFile })}
            />
            <PathInput
              title="Passphrase"
              value={profile.passphrase ?? ""}
              placeholder="$MTLS_PASSPHRASE"
              focused={focused && field === base + 5}
              activeEnv={activeEnv}
              collectionDir={collectionDir}
              pathCompletion={false}
              onFocus={() => setField(base + 5)}
              onChange={(passphrase) =>
                updateProfile(index, { passphrase: passphrase || undefined })
              }
            />
            <box
              onMouseDown={(event) => {
                if (event.button !== MouseButton.LEFT) return
                setField(base + 6)
                removeProfile(index)
                event.stopPropagation()
              }}
            >
              <text
                fg={
                  focused && field === base + 6 ? theme.error : theme.textMuted
                }
              >
                Remove certificate
              </text>
            </box>
          </box>
        )
      })}
      <box
        onMouseDown={(event) => {
          if (event.button !== MouseButton.LEFT) return
          setField(fieldCount - 1)
          addProfile()
          event.stopPropagation()
        }}
      >
        <text
          fg={
            focused && field === fieldCount - 1
              ? theme.primary
              : theme.textMuted
          }
        >
          + Add client certificate
        </text>
      </box>
    </box>
  )
}

function FieldLabel({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  const theme = useTheme()
  return (
    <box style={{ flexDirection: "column", gap: 0 }}>
      <text fg={theme.text}>{title}</text>
      <text fg={theme.textMuted} wrapMode="word">
        {description}
      </text>
      {children}
    </box>
  )
}

function TextInput({
  title,
  value,
  placeholder,
  focused,
  onFocus,
  onChange,
}: {
  title: string
  value: string
  placeholder: string
  focused: boolean
  onFocus: () => void
  onChange: (value: string) => void
}) {
  const theme = useTheme()
  return (
    <box style={{ flexDirection: "column" }}>
      <text fg={theme.textMuted}>{title}</text>
      <box onMouseDown={onFocus}>
        <input
          value={value}
          placeholder={placeholder}
          focused={focused}
          onInput={onChange}
          backgroundColor={theme.backgroundPanel}
          focusedBackgroundColor={theme.borderSubtle}
          textColor={theme.text}
          cursorColor={theme.primary}
          placeholderColor={theme.textMuted}
          paddingX={1}
        />
      </box>
    </box>
  )
}

function PathInput({
  title,
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
  value: string
  placeholder: string
  focused: boolean
  activeEnv: Environment | null
  collectionDir: string
  pathCompletion?: boolean
  onFocus: () => void
  onChange: (value: string) => void
}) {
  const theme = useTheme()
  return (
    <box style={{ flexDirection: "column" }}>
      <text fg={theme.textMuted}>{title}</text>
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
        backgroundColor={theme.backgroundPanel}
        focusedBackgroundColor={theme.borderSubtle}
        paddingX={1}
      />
    </box>
  )
}
