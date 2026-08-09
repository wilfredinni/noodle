import { MouseButton, ScrollBoxRenderable, TextAttributes } from "@opentui/core"
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
  Environment,
} from "../../schema"
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
import { ProxySettingsForm } from "./ProxySettingsForm"
import { moveRegisteredCollection } from "./collectionRegistry"
import { SIDEBAR_WIDTH } from "../Sidebar"

export type SettingsScope = "global" | "collection"
export type GlobalSettingsCategory =
  "appearance" | "behavior" | "network" | "collections" | "keyboard"
export type CollectionSettingsCategory = "general" | "network"
export type SettingsCategory =
  GlobalSettingsCategory | CollectionSettingsCategory

const GLOBAL_CATEGORIES: readonly {
  id: GlobalSettingsCategory
  label: string
}[] = [
  { id: "appearance", label: "Appearance" },
  { id: "behavior", label: "Behavior" },
  { id: "network", label: "Network" },
  { id: "collections", label: "Collections" },
  { id: "keyboard", label: "Keyboard" },
]

const COLLECTION_CATEGORIES: readonly {
  id: CollectionSettingsCategory
  label: string
}[] = [
  { id: "general", label: "General" },
  { id: "network", label: "Network" },
]

const KEYBIND_CATEGORIES: readonly KeybindCategory[] = [
  "Navigation",
  "Request",
  "Environment",
  "Workspace",
  "System",
]

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
  collectionProxy,
  noProxy,
  activeEnv,
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
  collectionProxy?: CollectionProxySettings
  noProxy: boolean
  activeEnv: Environment | null
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
  const [contentIndex, setContentIndex] = useState(0)
  const [selectOpen, setSelectOpen] = useState(false)
  const [captureName, setCaptureName] = useState<KeybindName | null>(null)
  const [message, setMessage] = useState<{
    text: string
    kind: "success" | "error"
  } | null>(null)
  const [pathInput, setPathInput] = useState("")
  const [proxyTextInput, setProxyTextInput] = useState(false)
  const [hoveredCollectionIndex, setHoveredCollectionIndex] = useState<
    number | null
  >(null)
  const [hoveredCategory, setHoveredCategory] =
    useState<SettingsCategory | null>(null)
  const panelNum = parseInt(theme.backgroundPanel.slice(1), 16)
  const elemNum = parseInt(theme.backgroundElement.slice(1), 16)
  const stripeR = Math.round(
    (((panelNum >> 16) & 0xff) + ((elemNum >> 16) & 0xff)) / 2,
  )
  const stripeG = Math.round(
    (((panelNum >> 8) & 0xff) + ((elemNum >> 8) & 0xff)) / 2,
  )
  const stripeB = Math.round(((panelNum & 0xff) + (elemNum & 0xff)) / 2)
  const stripeBg = `#${stripeR.toString(16).padStart(2, "0")}${stripeG.toString(16).padStart(2, "0")}${stripeB.toString(16).padStart(2, "0")}`
  const categories =
    scope === "global" ? GLOBAL_CATEGORIES : COLLECTION_CATEGORIES
  const categoryIndex = Math.max(
    0,
    categories.findIndex((item) => item.id === category),
  )
  const collectionRegisterIndex = collections.length
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
    const textInputActive =
      focus === "settings-content" &&
      ((category === "collections" &&
        contentIndex === collectionRegisterIndex) ||
        (category === "network" && proxyTextInput))
    keymap.setData("app.text-input", textInputActive)
    return () => keymap.setData("app.text-input", false)
  }, [
    category,
    collectionRegisterIndex,
    contentIndex,
    focus,
    keymap,
    proxyTextInput,
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
      category === "collections" &&
      contentIndex === collectionRegisterIndex
    ) {
      pathInputRef.current?.focus()
    }
  }, [category, collectionRegisterIndex, contentIndex, focus])

  useEffect(() => {
    if (focus !== "settings-content") return
    if (category === "keyboard") {
      const name = keybindNames[contentIndex]
      if (name) scrollRef.current?.scrollChildIntoView(`settings-key-${name}`)
    } else if (category === "collections") {
      scrollRef.current?.scrollChildIntoView(
        contentIndex < collections.length
          ? `settings-collection-${contentIndex}`
          : "settings-collection-register",
      )
    }
  }, [category, contentIndex, collections, focus, keybindNames, message])

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
          onClose()
          return
        }
        if (focus === "settings-sidebar") {
          if (event.name === "left" || event.name === "right") {
            event.preventDefault()
            event.stopPropagation()
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
          } else if (event.name === "r") {
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
            if (event.ctrl && contentIndex < collections.length) {
              const index = contentIndex
              const delta = event.name === "up" ? -1 : 1
              const next = moveRegisteredCollection(collections, index, delta)
              if (next && onCollectionsChange(next)) {
                setContentIndex(index + delta)
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
          if (event.name === "delete" && contentIndex < collections.length) {
            event.preventDefault()
            event.stopPropagation()
            onCollectionUnregister(collections[contentIndex]!)
          }
          return
        }

        const fieldCount = category === "appearance" ? 2 : 1
        if (event.name === "tab") {
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
          gap: 1,
        }}
        border={[...FullBorder.border]}
        customBorderChars={FullBorder.customBorderChars}
        borderColor={
          focus === "settings-sidebar" ? theme.primary : theme.borderSubtle
        }
        onPaneFocus={() => onPaneFocus("settings-sidebar")}
      >
        {jumpMode && <JumpBadge letter="s" style={JUMP_BADGE_TOP_INDENT} />}
        <box style={{ flexDirection: "row", gap: 0 }}>
          <ScopeButton
            id="settings-scope-global"
            label="Global"
            selected={scope === "global"}
            onSelect={() => onScopeChange("global")}
          />
          <ScopeButton
            id="settings-scope-collection"
            label="Collection"
            selected={scope === "collection"}
            disabled={!collectionAvailable}
            onSelect={() => {
              if (collectionAvailable) onScopeChange("collection")
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
                  title="Theme"
                  description="Color palette used throughout Noodle."
                >
                  <Select
                    items={THEMES.map((item, index) => ({
                      id: String(index),
                      label: item.name,
                    }))}
                    value={String(activeThemeIndex)}
                    focused={focus === "settings-content" && contentIndex === 0}
                    onActivate={() => setContentIndex(0)}
                    onOpenChange={setSelectOpen}
                    onChange={(value) => onThemeChange(Number(value))}
                    maxDropdownHeight={12}
                  />
                </SettingLabel>
                <SettingLabel
                  title="Layout"
                  description="Arrange request and response panes."
                >
                  <Select
                    items={[
                      { id: "stacked", label: "Stacked" },
                      { id: "side-by-side", label: "Side by side" },
                    ]}
                    value={layout}
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
                <box
                  style={{ flexDirection: "row" }}
                  onMouseDown={(event) => {
                    if (event.button !== MouseButton.LEFT) return
                    onConfirmUndoAllChange(!confirmUndoAll)
                    onPaneFocus("settings-content")
                    event.stopPropagation()
                  }}
                >
                  <Checkbox checked={confirmUndoAll} theme={theme} />
                  <box style={{ flexDirection: "column", flexGrow: 1 }}>
                    <text fg={theme.text}>Confirm undo all</text>
                    <text fg={theme.textMuted} wrapMode="word">
                      Ask before discarding every unsaved request and folder
                      change.
                    </text>
                  </box>
                </box>
              </>
            )}
            {category === "network" && (
              <>
                <SettingsSectionHeader
                  title="Network"
                  description={
                    scope === "global"
                      ? "Configure proxy behavior for Noodle requests."
                      : "Override proxy behavior for this collection."
                  }
                />
                <ProxySettingsForm
                  scope={scope === "global" ? "app" : "collection"}
                  proxy={scope === "global" ? appProxy : collectionProxy}
                  activeEnv={activeEnv}
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
                />
              </>
            )}
            {scope === "global" && category === "collections" && (
              <>
                <SettingsSectionHeader
                  title="Collections"
                  description="Manage registered collection paths and their order."
                />
                <box style={{ flexDirection: "column", gap: 0 }}>
                  <text fg={theme.text}>Registered collections</text>
                  {collections.length === 0 ? (
                    <text fg={theme.textMuted}>No registered collections.</text>
                  ) : (
                    <box style={{ flexDirection: "column", gap: 0 }}>
                      {collections.map((path, index) => {
                        const selected =
                          focus === "settings-content" && contentIndex === index
                        const hovered = hoveredCollectionIndex === index
                        return (
                          <box
                            key={path}
                            id={`settings-collection-${index}`}
                            style={{
                              flexDirection: "row",
                              height: 1,
                              gap: 0,
                              paddingLeft: 1,
                              paddingRight: 1,
                              backgroundColor:
                                selected || hovered
                                  ? theme.backgroundElement
                                  : index % 2 !== 0
                                    ? stripeBg
                                    : undefined,
                            }}
                            onMouseDown={(event) => {
                              if (event.button !== MouseButton.LEFT) return
                              setContentIndex(index)
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
                <box
                  id="settings-collection-register"
                  style={{ flexDirection: "column", gap: 0 }}
                >
                  <text fg={theme.text}>Register collection</text>
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
                    backgroundColor={theme.backgroundElement}
                    focusedBackgroundColor={theme.borderSubtle}
                    pathCompletion={{ kind: "directory" }}
                  />
                  <text fg={theme.textMuted} wrapMode="word">
                    Add an initialized collection. Absolute paths and @/ home
                    paths are supported.
                  </text>
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
                  description="Choose the environment used by this collection."
                />
                <SettingLabel
                  title="Active environment"
                  description="Used for variable substitution when sending requests."
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
                    interactive={envNames.length > 0}
                    focused={focus === "settings-content"}
                    onOpenChange={setSelectOpen}
                    onChange={onEnvironmentChange}
                  />
                </SettingLabel>
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
  title,
  description,
  children,
}: {
  title: string
  description: string
  children?: ReactNode
}) {
  const theme = useTheme()
  return (
    <box style={{ flexDirection: "column", gap: 0 }}>
      <text fg={theme.text}>{title}</text>
      {children}
      <text fg={theme.textMuted} wrapMode="word">
        {description}
      </text>
    </box>
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
    <box style={{ flexDirection: "column", gap: 0 }}>
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
  captureName,
  message,
  keybinds,
  onSelect,
}: {
  names: KeybindName[]
  selectedIndex: number
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
        const selected = index === selectedIndex
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
