import {
  MouseButton,
  ScrollBoxRenderable,
  TextAttributes,
  type InputRenderable,
  type TextareaRenderable,
} from "@opentui/core"
import { useKeymap } from "@opentui/keymap/react"
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import type {
  AppProxySettings,
  CollectionProxySettings,
  CollectionSettings,
  CollectionTlsSettings,
  ProxyCredentials,
} from "../../schema"
import { DEFAULT_TIMELINE_MAX_ENTRIES } from "../../filestore"
import type { Focus } from "../focus"
import {
  Definitions,
  displayKey,
  findKeybindConflict,
  keyEventToBinding,
  type KeybindCategory,
  type KeybindName,
  type Keybinds,
} from "../keybind"
import { THEMES } from "../theme-data"
import { useTheme } from "../theme"
import { FullBorder, LeftBar } from "../borders"
import { Frame } from "../Frame"
import { Checkbox } from "../Checkbox"
import { Select } from "../Select"
import { VarInput, type VarInputHandle } from "../VarInput"
import { JumpBadge, JUMP_BADGE_TOP_INDENT } from "../JumpBadge"
import { SIDEBAR_WIDTH } from "../Sidebar"
import { ProxySettingsForm } from "./ProxySettingsForm"
import { SettingsField } from "./SettingsField"
import { TlsSettingsForm } from "./TlsSettingsForm"
import { moveRegisteredCollection } from "./collectionRegistry"

export type SettingsScope = "global" | "collection"
export type GlobalSettingsCategory =
  "appearance" | "behavior" | "network" | "collections" | "keyboard"
export type CollectionSettingsCategory = "general" | "network" | "tls"
export type SettingsCategory =
  GlobalSettingsCategory | CollectionSettingsCategory

const GLOBAL_CATEGORIES: readonly {
  id: GlobalSettingsCategory
  label: string
}[] = [
  { id: "appearance", label: "Appearance" },
  { id: "behavior", label: "Behavior" },
  { id: "network", label: "Proxy" },
  { id: "collections", label: "Collections" },
  { id: "keyboard", label: "Keyboard" },
]

const COLLECTION_CATEGORIES: readonly {
  id: CollectionSettingsCategory
  label: string
}[] = [
  { id: "general", label: "General" },
  { id: "network", label: "Proxy" },
  { id: "tls", label: "TLS" },
]

const KEYBIND_CATEGORIES: readonly KeybindCategory[] = [
  "Navigation",
  "Request",
  "Environment",
  "Workspace",
  "System",
]

export function parseTimelineMaxEntries(
  rawValue: string,
): { value: number | undefined } | { error: string } {
  const raw = rawValue.trim()
  if (raw !== "" && !/^\d+$/.test(raw)) {
    return {
      error:
        "Timeline entries must be a non-negative integer, or blank for 50.",
    }
  }
  const value = raw === "" ? undefined : Number(raw)
  return value === undefined || Number.isSafeInteger(value)
    ? { value }
    : { error: "Timeline entries must be a non-negative safe integer." }
}

export function SettingsView({
  scope,
  category,
  collectionAvailable,
  focus,
  jumpMode = false,
  activeThemeIndex,
  layout,
  confirmUndoAll,
  appProxy,
  appProxyCredentials = {},
  collectionProxy,
  collectionProxyCredentials = {},
  collectionTls,
  tlsPassphrases = {},
  collectionName,
  collectionDescription,
  timelineMaxEntries,
  noProxy,
  insecure = false,
  envNames,
  activeEnvName,
  keybinds,
  collections,
  activeCollectionDir,
  onScopeChange,
  onCategoryChange,
  onPaneFocus,
  onClose,
  onThemeChange,
  onLayoutChange,
  onConfirmUndoAllChange,
  onAppProxyChange,
  onCollectionProxyChange,
  onAppProxyCredentialsChange = async () => false,
  onCollectionProxyCredentialsChange = async () => false,
  onProxyAuthDisable = async () => false,
  onTlsPassphraseChange = async () => false,
  onTlsProfileRemove = async () => false,
  onCollectionSettingsChange,
  onEnvironmentChange,
  onKeybindChange,
  onCollectionsChange,
  onCollectionUnregister,
  onRegisterCollection,
}: {
  scope: SettingsScope
  category: SettingsCategory
  collectionAvailable: boolean
  focus: Focus
  jumpMode?: boolean
  activeThemeIndex: number
  layout: "stacked" | "side-by-side"
  confirmUndoAll: boolean
  appProxy?: AppProxySettings
  appProxyCredentials?: ProxyCredentials
  collectionProxy?: CollectionProxySettings
  collectionProxyCredentials?: ProxyCredentials
  collectionTls?: CollectionTlsSettings
  tlsPassphrases?: Record<string, string>
  collectionName?: string
  collectionDescription?: string
  timelineMaxEntries?: number
  noProxy: boolean
  insecure?: boolean
  envNames: string[]
  activeEnvName: string | null
  keybinds: Keybinds
  collections: string[]
  activeCollectionDir: string
  onScopeChange: (scope: SettingsScope) => void
  onCategoryChange: (category: SettingsCategory) => void
  onPaneFocus: (focus: Focus) => void
  onClose: () => void
  onThemeChange: (index: number) => void
  onLayoutChange: (layout: "stacked" | "side-by-side") => boolean
  onConfirmUndoAllChange: (value: boolean) => void
  onAppProxyChange: (proxy: AppProxySettings) => boolean
  onCollectionProxyChange: (proxy: CollectionProxySettings) => boolean
  onAppProxyCredentialsChange?: (
    credentials: ProxyCredentials,
  ) => Promise<boolean>
  onCollectionProxyCredentialsChange?: (
    credentials: ProxyCredentials,
  ) => Promise<boolean>
  onProxyAuthDisable?: (scope: "app" | "collection") => Promise<boolean>
  onTlsPassphraseChange?: (index: number, value: string) => Promise<boolean>
  onTlsProfileRemove?: (index: number) => Promise<boolean>
  onCollectionSettingsChange: (
    patch: Pick<
      CollectionSettings,
      "name" | "description" | "timelineMaxEntries" | "tls"
    >,
  ) => boolean
  onEnvironmentChange: (name: string) => void
  onKeybindChange: (name: KeybindName, key: string) => boolean
  onCollectionsChange: (collections: string[]) => boolean
  onCollectionUnregister: (path: string) => void
  onRegisterCollection: (path: string) => string | null
}) {
  const theme = useTheme()
  const keymap = useKeymap()
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)
  const pathInputRef = useRef<VarInputHandle | null>(null)
  const collectionNameRef = useRef<InputRenderable | null>(null)
  const collectionDescriptionRef = useRef<TextareaRenderable | null>(null)
  const timelineMaxEntriesRef = useRef<InputRenderable | null>(null)
  const [contentIndex, setContentIndex] = useState(0)
  const [selectOpen, setSelectOpen] = useState(false)
  const [captureName, setCaptureName] = useState<KeybindName | null>(null)
  const [message, setMessage] = useState<{
    text: string
    kind: "success" | "error"
  } | null>(null)
  const [pathInput, setPathInput] = useState("")
  const [collectionNameDraft, setCollectionNameDraft] = useState(
    collectionName ?? "",
  )
  const [collectionDescriptionDraft, setCollectionDescriptionDraft] = useState(
    collectionDescription ?? "",
  )
  const [timelineMaxEntriesDraft, setTimelineMaxEntriesDraft] = useState(
    String(timelineMaxEntries ?? DEFAULT_TIMELINE_MAX_ENTRIES),
  )
  const [collectionGeneralError, setCollectionGeneralError] = useState<
    string | null
  >(null)
  const [proxyTextInput, setProxyTextInput] = useState(false)
  const [tlsTextInput, setTlsTextInput] = useState(false)
  const [hoveredCollectionIndex, setHoveredCollectionIndex] = useState<
    number | null
  >(null)
  const [hoveredCategory, setHoveredCategory] =
    useState<SettingsCategory | null>(null)
  const categories =
    scope === "global" ? GLOBAL_CATEGORIES : COLLECTION_CATEGORIES
  const categoryIndex = Math.max(
    0,
    categories.findIndex((item) => item.id === category),
  )
  const collectionRegisterIndex = 0
  const keybindNames = useMemo(
    () =>
      KEYBIND_CATEGORIES.flatMap((group) =>
        (Object.keys(Definitions) as KeybindName[]).filter(
          (name) =>
            Definitions[name].category === group && !Definitions[name].fixed,
        ),
      ),
    [],
  )
  const revealProxyField = useCallback((field: string) => {
    scrollRef.current?.scrollChildIntoView(`settings-proxy-${field}`)
  }, [])

  useEffect(() => {
    setCollectionNameDraft(collectionName ?? "")
    setCollectionDescriptionDraft(collectionDescription ?? "")
    setTimelineMaxEntriesDraft(
      String(timelineMaxEntries ?? DEFAULT_TIMELINE_MAX_ENTRIES),
    )
    setCollectionGeneralError(null)
  }, [
    activeCollectionDir,
    collectionDescription,
    collectionName,
    timelineMaxEntries,
  ])

  const commitCollectionGeneralField = useCallback(
    (index: number): boolean => {
      setCollectionGeneralError(null)
      if (index === 0) {
        const name = collectionNameDraft.trim() || undefined
        if (name === collectionName) return true
        if (!onCollectionSettingsChange({ name })) return false
        setCollectionNameDraft(name ?? "")
        return true
      }
      if (index === 1) {
        const description =
          (
            collectionDescriptionRef.current?.plainText ??
            collectionDescriptionDraft
          ).trim() || undefined
        if (description === collectionDescription) return true
        if (!onCollectionSettingsChange({ description })) return false
        setCollectionDescriptionDraft(description ?? "")
        return true
      }
      if (index !== 2) return true

      const parsed = parseTimelineMaxEntries(timelineMaxEntriesDraft)
      if ("error" in parsed) {
        setCollectionGeneralError(parsed.error)
        return false
      }
      const { value } = parsed
      if (value !== timelineMaxEntries) {
        if (!onCollectionSettingsChange({ timelineMaxEntries: value })) {
          return false
        }
      }
      setTimelineMaxEntriesDraft(String(value ?? DEFAULT_TIMELINE_MAX_ENTRIES))
      return true
    },
    [
      collectionDescription,
      collectionDescriptionDraft,
      collectionName,
      collectionNameDraft,
      onCollectionSettingsChange,
      timelineMaxEntries,
      timelineMaxEntriesDraft,
    ],
  )

  const activateCollectionGeneralField = useCallback(
    (index: number) => {
      if (
        contentIndex === index ||
        commitCollectionGeneralField(contentIndex)
      ) {
        setContentIndex(index)
        onPaneFocus("settings-content")
      }
    },
    [commitCollectionGeneralField, contentIndex, onPaneFocus],
  )

  const commitCurrentCollectionGeneralField = useCallback(
    () =>
      scope !== "collection" ||
      category !== "general" ||
      commitCollectionGeneralField(contentIndex),
    [category, commitCollectionGeneralField, contentIndex, scope],
  )

  useEffect(() => {
    const textInputActive =
      focus === "settings-content" &&
      ((category === "collections" &&
        contentIndex === collectionRegisterIndex) ||
        (scope === "collection" &&
          category === "general" &&
          contentIndex < 3) ||
        (category === "network" && proxyTextInput) ||
        (category === "tls" && tlsTextInput))
    keymap.setData("app.text-input", textInputActive)
    return () => keymap.setData("app.text-input", false)
  }, [
    category,
    collectionRegisterIndex,
    contentIndex,
    focus,
    keymap,
    proxyTextInput,
    tlsTextInput,
    scope,
  ])

  useEffect(() => {
    setContentIndex(0)
    setMessage(null)
    setCaptureName(null)
    setHoveredCollectionIndex(null)
    setHoveredCategory(null)
    scrollRef.current?.scrollTo(0)
  }, [scope, category])

  useEffect(() => {
    if (
      focus === "settings-content" &&
      scope === "collection" &&
      category === "general"
    ) {
      if (contentIndex === 0) collectionNameRef.current?.focus()
      else if (contentIndex === 1) collectionDescriptionRef.current?.focus()
      else if (contentIndex === 2) timelineMaxEntriesRef.current?.focus()
    }
    if (
      focus === "settings-content" &&
      category === "collections" &&
      contentIndex === collectionRegisterIndex
    ) {
      pathInputRef.current?.focus()
    }
  }, [category, collectionRegisterIndex, contentIndex, focus, scope])

  useEffect(() => {
    if (focus !== "settings-content") return
    if (category === "keyboard") {
      const name = keybindNames[contentIndex]
      if (name) scrollRef.current?.scrollChildIntoView(`settings-key-${name}`)
    } else if (category === "collections") {
      scrollRef.current?.scrollChildIntoView(
        contentIndex > 0 && contentIndex <= collections.length
          ? `settings-collection-${contentIndex - 1}`
          : "settings-collection-register",
      )
    } else if (scope === "collection" && category === "general") {
      const id = [
        "settings-collection-name",
        "settings-collection-description",
        "settings-timeline-max-entries",
        "settings-active-environment",
      ][contentIndex]
      if (id) scrollRef.current?.scrollChildIntoView(id)
    }
  }, [category, contentIndex, collections, focus, keybindNames, message, scope])

  useEffect(() => {
    if (!captureName) return
    const dispose = keymap.intercept(
      "key",
      (ctx) => {
        ctx.event.preventDefault()
        ctx.event.stopPropagation()
        if (ctx.event.name === "escape") {
          setCaptureName(null)
          setMessage(null)
          return
        }
        const binding = keyEventToBinding(ctx.event)
        if (!binding) {
          setMessage({
            text: "That key cannot be assigned. Use Ctrl, Alt, Shift, or a documented key.",
            kind: "error",
          })
          return
        }
        const conflict = findKeybindConflict(captureName, binding, keybinds)
        if (conflict) {
          setMessage({
            text: `Already used by ${Definitions[conflict].description}`,
            kind: "error",
          })
          return
        }
        if (onKeybindChange(captureName, binding)) {
          setCaptureName(null)
          setMessage({ text: "Shortcut saved", kind: "success" })
        }
      },
      { priority: 220 },
    )
    return dispose
  }, [captureName, keybinds, keymap, onKeybindChange])

  useEffect(() => {
    if (captureName || selectOpen) return
    const dispose = keymap.intercept(
      "key",
      (ctx) => {
        if (keymap.getData("app.overlay") !== "none") return
        const event = ctx.event
        if (event.name === "escape") {
          event.preventDefault()
          event.stopPropagation()
          if (!commitCurrentCollectionGeneralField()) {
            setCollectionNameDraft(collectionName ?? "")
            setCollectionDescriptionDraft(collectionDescription ?? "")
            setTimelineMaxEntriesDraft(
              String(timelineMaxEntries ?? DEFAULT_TIMELINE_MAX_ENTRIES),
            )
            setCollectionGeneralError(null)
          }
          onClose()
          return
        }
        if (focus === "settings-sidebar") {
          if (event.name === "left" || event.name === "right") {
            event.preventDefault()
            event.stopPropagation()
            if (!commitCurrentCollectionGeneralField()) return
            if (scope === "global" && collectionAvailable) {
              onScopeChange("collection")
            } else if (scope === "collection") {
              onScopeChange("global")
            }
            return
          }
          if (["up", "down", "home", "end"].includes(event.name)) {
            event.preventDefault()
            event.stopPropagation()
            if (!commitCurrentCollectionGeneralField()) return
            const next =
              event.name === "home"
                ? 0
                : event.name === "end"
                  ? categories.length - 1
                  : (categoryIndex +
                      (event.name === "up" ? -1 : 1) +
                      categories.length) %
                    categories.length
            onCategoryChange(categories[next]!.id)
          }
          return
        }
        if (focus !== "settings-content") return

        if (scope === "collection" && category === "general") {
          if (["up", "down", "home", "end"].includes(event.name)) {
            event.preventDefault()
            event.stopPropagation()
            if (!commitCollectionGeneralField(contentIndex)) return
            const next =
              event.name === "home"
                ? 0
                : event.name === "end"
                  ? 3
                  : Math.min(
                      3,
                      Math.max(
                        0,
                        contentIndex + (event.name === "up" ? -1 : 1),
                      ),
                    )
            setContentIndex(next)
          } else if (event.name === "tab") {
            event.preventDefault()
            event.stopPropagation()
            if (!commitCollectionGeneralField(contentIndex)) return
            const next = contentIndex + (event.shift ? -1 : 1)
            if (next < 0 || next >= 4) onPaneFocus("settings-sidebar")
            else setContentIndex(next)
          } else if (
            event.name === "return" &&
            (contentIndex === 0 || contentIndex === 2)
          ) {
            event.preventDefault()
            event.stopPropagation()
            commitCollectionGeneralField(contentIndex)
          } else if (event.name === "return" && contentIndex === 1) {
            event.preventDefault()
            event.stopPropagation()
            collectionDescriptionRef.current?.insertText("\n")
          }
          return
        }

        if (category === "keyboard") {
          if (event.name === "up" || event.name === "down") {
            event.preventDefault()
            event.stopPropagation()
            setContentIndex(
              (index) =>
                (index + (event.name === "up" ? -1 : 1) + keybindNames.length) %
                keybindNames.length,
            )
          } else if (event.name === "return") {
            event.preventDefault()
            event.stopPropagation()
            const name = keybindNames[contentIndex]
            if (!name) return
            setCaptureName(name)
            setMessage({
              text: "Press a shortcut · Esc cancels",
              kind: "success",
            })
          } else if (keyEventToBinding(event) === keybinds.browse_delete) {
            event.preventDefault()
            event.stopPropagation()
            const name = keybindNames[contentIndex]
            if (name) {
              if (onKeybindChange(name, Definitions[name].default)) {
                setMessage({ text: "Shortcut reset", kind: "success" })
              }
            }
          }
          return
        }

        if (category === "collections") {
          if (
            event.name === "return" &&
            contentIndex === collectionRegisterIndex
          ) {
            event.preventDefault()
            event.stopPropagation()
            const error = onRegisterCollection(pathInput)
            setMessage({
              text: error ?? "Collection registered",
              kind: error ? "error" : "success",
            })
            if (!error) {
              setPathInput("")
              setContentIndex(collections.length + 1)
            }
            return
          }
          if (event.name === "up" || event.name === "down") {
            event.preventDefault()
            event.stopPropagation()
            if (event.ctrl && contentIndex > 0) {
              const index = contentIndex - 1
              const delta = event.name === "up" ? -1 : 1
              const next = moveRegisteredCollection(collections, index, delta)
              if (next && onCollectionsChange(next)) {
                setContentIndex(index + delta + 1)
              }
            } else {
              setContentIndex(
                (index) =>
                  (index +
                    (event.name === "up" ? -1 : 1) +
                    collections.length +
                    1) %
                  (collections.length + 1),
              )
            }
            return
          }
          if (
            keyEventToBinding(event) === keybinds.request_delete &&
            contentIndex < collections.length
          ) {
            event.preventDefault()
            event.stopPropagation()
            onCollectionUnregister(collections[contentIndex - 1]!)
          }
          return
        }

        const fieldCount = category === "appearance" ? 2 : 1
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
                    Math.max(0, contentIndex + (event.name === "up" ? -1 : 1)),
                  )
          setContentIndex(next)
        } else if (event.name === "tab") {
          event.preventDefault()
          event.stopPropagation()
          const direction = event.shift ? -1 : 1
          const next = contentIndex + direction
          if (next < 0 || next >= fieldCount) {
            onPaneFocus("settings-sidebar")
          } else {
            setContentIndex(next)
          }
        } else if (event.name === "space" && category === "behavior") {
          event.preventDefault()
          event.stopPropagation()
          onConfirmUndoAllChange(!confirmUndoAll)
        }
      },
      { priority: 80 },
    )
    return dispose
  }, [
    captureName,
    categories,
    category,
    categoryIndex,
    collectionAvailable,
    collectionRegisterIndex,
    collections,
    commitCollectionGeneralField,
    commitCurrentCollectionGeneralField,
    confirmUndoAll,
    contentIndex,
    focus,
    keybindNames,
    keymap,
    onCategoryChange,
    onClose,
    onCollectionUnregister,
    onCollectionsChange,
    onConfirmUndoAllChange,
    onKeybindChange,
    onPaneFocus,
    onRegisterCollection,
    onScopeChange,
    pathInput,
    scope,
    selectOpen,
  ])

  return (
    <box style={{ flexDirection: "row", flexGrow: 1, gap: 1, minHeight: 0 }}>
      <Frame
        style={{
          width: SIDEBAR_WIDTH,
          flexDirection: "column",
          flexShrink: 0,
          backgroundColor: theme.backgroundPanel,
          paddingTop: 0,
          paddingBottom: 0,
          paddingLeft: 1,
          paddingRight: 1,
        }}
        border={[...FullBorder.border]}
        customBorderChars={FullBorder.customBorderChars}
        borderColor={
          focus === "settings-sidebar" ? theme.primary : theme.borderSubtle
        }
        onPaneFocus={() => {
          if (commitCurrentCollectionGeneralField()) {
            onPaneFocus("settings-sidebar")
          }
        }}
      >
        {jumpMode && <JumpBadge letter="s" style={JUMP_BADGE_TOP_INDENT} />}
        <box style={{ flexDirection: "row", gap: 0 }}>
          <ScopeButton
            id="settings-scope-global"
            label="Global"
            selected={scope === "global"}
            onSelect={() => {
              if (commitCurrentCollectionGeneralField()) {
                onScopeChange("global")
              }
            }}
          />
          <ScopeButton
            id="settings-scope-collection"
            label="Collection"
            selected={scope === "collection"}
            disabled={!collectionAvailable}
            onSelect={() => {
              if (
                collectionAvailable &&
                commitCurrentCollectionGeneralField()
              ) {
                onScopeChange("collection")
              }
            }}
          />
        </box>
        {!collectionAvailable && (
          <text fg={theme.textMuted} wrapMode="word">
            Initialize this directory to edit collection settings.
          </text>
        )}
        <box style={{ flexDirection: "column", flexGrow: 1 }}>
          {categories.map((item) => {
            const selected = item.id === category
            const hovered = hoveredCategory === item.id
            return (
              <box
                key={item.id}
                id={`settings-category-${item.id}`}
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  paddingLeft: 1,
                  backgroundColor:
                    selected || hovered ? theme.backgroundElement : undefined,
                }}
                border={[...LeftBar.border]}
                customBorderChars={LeftBar.customBorderChars}
                borderColor={selected ? theme.primary : theme.backgroundPanel}
                onMouseDown={(event) => {
                  if (event.button !== MouseButton.LEFT) return
                  if (!commitCurrentCollectionGeneralField()) return
                  onCategoryChange(item.id)
                  onPaneFocus("settings-sidebar")
                  event.stopPropagation()
                }}
                onMouseOver={() => setHoveredCategory(item.id)}
                onMouseOut={() => setHoveredCategory(null)}
              >
                <text fg={theme.text} wrapMode="none" truncate>
                  {item.label}
                </text>
              </box>
            )
          })}
        </box>
      </Frame>

      <Frame
        style={{
          flexDirection: "column",
          flexGrow: 1,
          minWidth: 0,
          minHeight: 0,
          backgroundColor: theme.backgroundPanel,
          paddingTop: 0,
          paddingBottom: 0,
          paddingLeft: 1,
          paddingRight: 1,
        }}
        border={[...FullBorder.border]}
        customBorderChars={FullBorder.customBorderChars}
        borderColor={
          focus === "settings-content" ? theme.primary : theme.borderSubtle
        }
        onPaneFocus={() => onPaneFocus("settings-content")}
      >
        {jumpMode && <JumpBadge letter="c" style={JUMP_BADGE_TOP_INDENT} />}
        <scrollbox
          ref={scrollRef}
          scrollY
          style={{ flexGrow: 1, minHeight: 0 }}
          verticalScrollbarOptions={{
            trackOptions: {
              backgroundColor: theme.background,
              foregroundColor: theme.borderActive,
            },
          }}
        >
          <box style={{ flexDirection: "column", gap: 1, paddingRight: 1 }}>
            {scope === "global" && category === "appearance" && (
              <>
                <SettingsSectionHeader
                  title="Appearance"
                  description="Choose how Noodle looks and arranges request panes."
                />
                <SettingLabel
                  id="settings-appearance-theme"
                  title="Theme"
                  description="Color palette used throughout Noodle."
                  active={focus === "settings-content" && contentIndex === 0}
                >
                  <Select
                    items={THEMES.map((item, index) => ({
                      id: String(index),
                      label: item.name,
                    }))}
                    value={String(activeThemeIndex)}
                    fitContent
                    focused={focus === "settings-content" && contentIndex === 0}
                    onActivate={() => setContentIndex(0)}
                    onOpenChange={setSelectOpen}
                    onChange={(value) => onThemeChange(Number(value))}
                    maxDropdownHeight={12}
                  />
                </SettingLabel>
                <SettingLabel
                  id="settings-appearance-layout"
                  title="Layout"
                  description="Arrange request and response panes."
                  active={focus === "settings-content" && contentIndex === 1}
                >
                  <Select
                    items={[
                      { id: "stacked", label: "Stacked" },
                      { id: "side-by-side", label: "Side by side" },
                    ]}
                    value={layout}
                    fitContent
                    focused={focus === "settings-content" && contentIndex === 1}
                    onActivate={() => setContentIndex(1)}
                    onOpenChange={setSelectOpen}
                    onChange={(value) => onLayoutChange(value as typeof layout)}
                  />
                </SettingLabel>
              </>
            )}
            {scope === "global" && category === "behavior" && (
              <>
                <SettingsSectionHeader
                  title="Behavior"
                  description="Control confirmation prompts for destructive changes."
                />
                <SettingLabel
                  title="Confirm undo all"
                  description="Ask before discarding every unsaved request and folder change."
                  active={focus === "settings-content" && contentIndex === 0}
                  onMouseDown={() => {
                    onConfirmUndoAllChange(!confirmUndoAll)
                    onPaneFocus("settings-content")
                  }}
                >
                  <Checkbox checked={confirmUndoAll} theme={theme} />
                </SettingLabel>
              </>
            )}
            {category === "network" && (
              <>
                <SettingsSectionHeader
                  title="Proxy"
                  description={
                    scope === "global"
                      ? "Configure proxy behavior for Noodle requests."
                      : "Override proxy behavior for this collection."
                  }
                />
                <ProxySettingsForm
                  scope={scope === "global" ? "app" : "collection"}
                  proxy={scope === "global" ? appProxy : collectionProxy}
                  credentials={
                    scope === "global"
                      ? appProxyCredentials
                      : collectionProxyCredentials
                  }
                  focused={focus === "settings-content"}
                  noProxy={noProxy}
                  onExit={() => onPaneFocus("settings-sidebar")}
                  onFieldFocus={revealProxyField}
                  onTextInputFocusChange={setProxyTextInput}
                  onChange={(proxy) =>
                    scope === "global"
                      ? onAppProxyChange(proxy as AppProxySettings)
                      : onCollectionProxyChange(
                          proxy as CollectionProxySettings,
                        )
                  }
                  onCredentialsChange={(credentials) =>
                    scope === "global"
                      ? onAppProxyCredentialsChange(credentials)
                      : onCollectionProxyCredentialsChange(credentials)
                  }
                  onAuthDisable={() =>
                    onProxyAuthDisable(
                      scope === "global" ? "app" : "collection",
                    )
                  }
                />
              </>
            )}
            {scope === "collection" && category === "tls" && (
              <>
                <SettingsSectionHeader
                  title="TLS"
                  description="Configure certificate verification, trust roots, and mutual TLS for this collection."
                />
                <TlsSettingsForm
                  settings={collectionTls}
                  passphrases={tlsPassphrases}
                  focused={focus === "settings-content"}
                  insecure={insecure}
                  collectionDir={activeCollectionDir}
                  onExit={() => onPaneFocus("settings-sidebar")}
                  onTextInputFocusChange={setTlsTextInput}
                  onChange={(tls) => onCollectionSettingsChange({ tls })}
                  onPassphraseChange={onTlsPassphraseChange}
                  onRemoveProfile={onTlsProfileRemove}
                />
              </>
            )}
            {scope === "global" && category === "collections" && (
              <>
                <SettingsSectionHeader
                  title="Collections"
                  description="Manage registered collection paths and their order."
                />
                <SettingsField
                  id="settings-collection-register"
                  title="Register collection"
                  description="Add an initialized collection. Absolute paths and @/ home paths are supported."
                  active={
                    focus === "settings-content" &&
                    contentIndex === collectionRegisterIndex
                  }
                  onMouseDown={() => {
                    setContentIndex(collectionRegisterIndex)
                    onPaneFocus("settings-content")
                    pathInputRef.current?.focus()
                  }}
                >
                  <VarInput
                    ref={pathInputRef}
                    value={pathInput}
                    env={null}
                    isEditing
                    isFocused={
                      focus === "settings-content" &&
                      contentIndex === collectionRegisterIndex
                    }
                    onChange={setPathInput}
                    onFocus={() => {
                      setContentIndex(collectionRegisterIndex)
                      onPaneFocus("settings-content")
                      pathInputRef.current?.focus()
                    }}
                    placeholder="@/Projects/my-api"
                    backgroundColor="transparent"
                    focusedBackgroundColor="transparent"
                    pathCompletion={{ kind: "directory" }}
                    style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0 }}
                  />
                </SettingsField>
                <box style={{ flexDirection: "column", gap: 0 }}>
                  <text fg={theme.text}>Registered collections</text>
                  {collections.length === 0 ? (
                    <text fg={theme.textMuted}>No registered collections.</text>
                  ) : (
                    <box style={{ flexDirection: "column", gap: 0 }}>
                      {collections.map((path, index) => {
                        const selected =
                          focus === "settings-content" &&
                          contentIndex === index + 1
                        const hovered = hoveredCollectionIndex === index
                        return (
                          <box
                            key={path}
                            id={`settings-collection-${index}`}
                            border={[...LeftBar.border]}
                            customBorderChars={LeftBar.customBorderChars}
                            borderColor={
                              selected ? theme.primary : theme.borderSubtle
                            }
                            style={{
                              flexDirection: "row",
                              height: 1,
                              gap: 0,
                              width: "100%",
                              minWidth: 0,
                              paddingLeft: 1,
                              paddingRight: 1,
                              backgroundColor:
                                selected || hovered
                                  ? theme.backgroundElement
                                  : undefined,
                            }}
                            onMouseDown={(event) => {
                              if (event.button !== MouseButton.LEFT) return
                              setContentIndex(index + 1)
                              onPaneFocus("settings-content")
                              event.stopPropagation()
                            }}
                            onMouseOver={() => setHoveredCollectionIndex(index)}
                            onMouseOut={() => setHoveredCollectionIndex(null)}
                          >
                            <box
                              style={{
                                flexDirection: "row",
                                justifyContent: "space-between",
                                flexGrow: 1,
                                minWidth: 0,
                              }}
                            >
                              <text
                                fg={selected ? theme.text : theme.textMuted}
                                truncate
                              >
                                {path}
                              </text>
                              {path === activeCollectionDir && (
                                <text fg={theme.primary}> current</text>
                              )}
                            </box>
                          </box>
                        )
                      })}
                    </box>
                  )}
                </box>
              </>
            )}
            {scope === "global" && category === "keyboard" && (
              <>
                <SettingsSectionHeader
                  title="Keyboard"
                  description="Customize shortcuts for actions you use often."
                />
                <KeyboardRows
                  names={keybindNames}
                  selectedIndex={contentIndex}
                  active={focus === "settings-content"}
                  captureName={captureName}
                  message={message}
                  keybinds={keybinds}
                  onSelect={(index) => {
                    setContentIndex(index)
                    onPaneFocus("settings-content")
                  }}
                />
              </>
            )}
            {scope === "collection" && category === "general" && (
              <>
                <SettingsSectionHeader
                  title="General"
                  description="Describe this collection and control its local history."
                />
                <box id="settings-collection-name">
                  <SettingLabel
                    title="Name"
                    description="Display name used in collection menus. The directory name is used when blank."
                    active={focus === "settings-content" && contentIndex === 0}
                  >
                    <input
                      id="settings-collection-name-input"
                      ref={collectionNameRef}
                      value={collectionNameDraft}
                      placeholder="Collection name"
                      onInput={setCollectionNameDraft}
                      onMouseDown={() => activateCollectionGeneralField(0)}
                      focused={
                        focus === "settings-content" && contentIndex === 0
                      }
                      backgroundColor="transparent"
                      focusedBackgroundColor="transparent"
                      textColor={theme.text}
                      cursorColor={theme.primary}
                      placeholderColor={theme.textMuted}
                      paddingX={0}
                      style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0 }}
                    />
                  </SettingLabel>
                </box>
                <box id="settings-collection-description">
                  <SettingLabel
                    title="Description"
                    description="Optional notes stored with this collection."
                    active={focus === "settings-content" && contentIndex === 1}
                    stacked
                  >
                    <textarea
                      id="settings-collection-description-input"
                      key={`${activeCollectionDir}:${collectionDescription ?? ""}`}
                      ref={collectionDescriptionRef}
                      initialValue={collectionDescription ?? ""}
                      placeholder="What is this collection for?"
                      onContentChange={() =>
                        setCollectionDescriptionDraft(
                          collectionDescriptionRef.current?.plainText ?? "",
                        )
                      }
                      onMouseDown={() => activateCollectionGeneralField(1)}
                      focused={
                        focus === "settings-content" && contentIndex === 1
                      }
                      backgroundColor={theme.backgroundElement}
                      focusedBackgroundColor={theme.borderSubtle}
                      textColor={theme.text}
                      cursorColor={theme.primary}
                      placeholderColor={theme.textMuted}
                      height={4}
                      paddingX={1}
                      style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0 }}
                    />
                  </SettingLabel>
                </box>
                <box id="settings-timeline-max-entries">
                  <SettingLabel
                    title="Timeline entries"
                    description="Maximum saved responses per request. Use 0 to disable history; blank resets to 50."
                    active={focus === "settings-content" && contentIndex === 2}
                  >
                    <input
                      ref={timelineMaxEntriesRef}
                      value={timelineMaxEntriesDraft}
                      placeholder={String(DEFAULT_TIMELINE_MAX_ENTRIES)}
                      onInput={(value) => {
                        setTimelineMaxEntriesDraft(value)
                        setCollectionGeneralError(null)
                      }}
                      onMouseDown={() => activateCollectionGeneralField(2)}
                      focused={
                        focus === "settings-content" && contentIndex === 2
                      }
                      backgroundColor="transparent"
                      focusedBackgroundColor="transparent"
                      textColor={theme.text}
                      cursorColor={theme.primary}
                      placeholderColor={theme.textMuted}
                      paddingX={0}
                      style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0 }}
                    />
                    {collectionGeneralError && (
                      <text fg={theme.error} wrapMode="word">
                        {collectionGeneralError}
                      </text>
                    )}
                  </SettingLabel>
                </box>
                <box id="settings-active-environment">
                  <SettingLabel
                    title="Active environment"
                    description="Used for variable substitution when sending requests."
                    active={focus === "settings-content" && contentIndex === 3}
                  >
                    <Select
                      items={envNames.map((name) => ({
                        id: name,
                        label: name,
                      }))}
                      value={activeEnvName ?? undefined}
                      placeholder={
                        envNames.length === 0
                          ? "No environments"
                          : "Select environment"
                      }
                      fitContent
                      interactive={envNames.length > 0}
                      focused={
                        focus === "settings-content" && contentIndex === 3
                      }
                      onActivate={() => activateCollectionGeneralField(3)}
                      onOpenChange={setSelectOpen}
                      onChange={onEnvironmentChange}
                    />
                  </SettingLabel>
                </box>
              </>
            )}
            {message && category !== "keyboard" && (
              <text
                fg={message.kind === "success" ? theme.success : theme.error}
              >
                {message.text}
              </text>
            )}
          </box>
        </scrollbox>
      </Frame>
    </box>
  )
}

function ScopeButton({
  id,
  label,
  selected,
  disabled = false,
  onSelect,
}: {
  id: string
  label: string
  selected: boolean
  disabled?: boolean
  onSelect: () => void
}) {
  const theme = useTheme()
  const [hovered, setHovered] = useState(false)
  return (
    <box
      id={id}
      style={{
        flexDirection: "column",
        flexGrow: 1,
        flexBasis: 0,
        opacity: disabled ? 0.45 : 1,
      }}
      onMouseDown={(event) => {
        if (event.button !== MouseButton.LEFT || disabled) return
        onSelect()
        event.stopPropagation()
      }}
      onMouseOver={() => setHovered(true)}
      onMouseOut={() => setHovered(false)}
    >
      <box style={{ paddingLeft: 1, paddingRight: 1 }}>
        <text
          fg={selected ? theme.primary : hovered ? theme.text : theme.textMuted}
          wrapMode="none"
          truncate
        >
          {label}
        </text>
      </box>
      <box
        border={["bottom"]}
        borderColor={selected ? theme.primary : theme.borderSubtle}
      />
    </box>
  )
}

function SettingLabel({
  id,
  title,
  description,
  active = false,
  alignItems,
  stacked = false,
  onMouseDown,
  children,
}: {
  id?: string
  title: string
  description: string
  active?: boolean
  alignItems?: "center" | "flex-start"
  stacked?: boolean
  onMouseDown?: () => void
  children?: ReactNode
}) {
  return (
    <SettingsField
      id={id}
      title={title}
      description={description}
      active={active}
      alignItems={alignItems}
      stacked={stacked}
      onMouseDown={onMouseDown}
    >
      {children}
    </SettingsField>
  )
}

function SettingsSectionHeader({
  title,
  description,
}: {
  title: string
  description: string
}) {
  const theme = useTheme()
  return (
    <box
      id="settings-section-header"
      style={{ flexDirection: "column", gap: 0 }}
    >
      <text fg={theme.text}>{title}</text>
      <text fg={theme.textMuted} wrapMode="word">
        {description}
      </text>
    </box>
  )
}

function KeyboardRows({
  names,
  selectedIndex,
  active,
  captureName,
  message,
  keybinds,
  onSelect,
}: {
  names: KeybindName[]
  selectedIndex: number
  active: boolean
  captureName: KeybindName | null
  message: { text: string; kind: "success" | "error" } | null
  keybinds: Keybinds
  onSelect: (index: number) => void
}) {
  const theme = useTheme()
  let previousCategory: KeybindCategory | null = null
  return (
    <box style={{ flexDirection: "column" }}>
      {names.map((name, index) => {
        const definition = Definitions[name]
        const showCategory = definition.category !== previousCategory
        previousCategory = definition.category
        const selected = active && index === selectedIndex
        const conflict = findKeybindConflict(name, keybinds[name], keybinds)
        return (
          <box
            key={name}
            id={`settings-key-${name}`}
            style={{
              flexDirection: "column",
              marginTop: showCategory && index > 0 ? 1 : 0,
            }}
          >
            {showCategory && (
              <text fg={theme.primary} attributes={TextAttributes.BOLD}>
                {definition.category}
              </text>
            )}
            <box
              id={`settings-key-${name}-row`}
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                backgroundColor: selected ? theme.backgroundElement : undefined,
                paddingLeft: 1,
                paddingRight: 1,
              }}
              onMouseDown={(event) => {
                if (event.button !== MouseButton.LEFT) return
                onSelect(index)
                event.stopPropagation()
              }}
            >
              <box
                style={{ flexDirection: "column", flexGrow: 1, minWidth: 0 }}
              >
                <text fg={selected ? theme.text : theme.textMuted}>
                  {definition.description}
                </text>
                {conflict && (
                  <text fg={theme.warning}>
                    Also used by {Definitions[conflict].description}
                  </text>
                )}
              </box>
              <text fg={theme.primary}>
                {captureName === name
                  ? "press keys…"
                  : `${displayKey(keybinds[name])}${keybinds[name] === definition.default ? "" : " · custom"}`}
              </text>
            </box>
            {selected && message && (
              <text
                id="settings-key-message"
                fg={message.kind === "success" ? theme.success : theme.error}
                wrapMode="word"
              >
                {message.text}
              </text>
            )}
          </box>
        )
      })}
    </box>
  )
}
