import { useCallback, useEffect, useRef, useState } from "react"
import { useKeymap } from "@opentui/keymap/react"
import type { ScriptFields } from "../../schema"
import { SCRIPT_TABS, scriptText, withScript } from "../../scriptAuthoring"
import type { ScriptPhase } from "../../preRequestScript"
import { ScriptEditor } from "../editor/ScriptEditor"
import { Tabs } from "../Tabs"

export function CollectionScripts({
  fields,
  focused,
  onFocus,
  onEditingChange,
  onChange,
}: {
  fields: ScriptFields
  focused: boolean
  onFocus: () => void
  onEditingChange: (editing: boolean) => void
  onChange: (patch: ScriptFields) => boolean
}) {
  const keymap = useKeymap()
  const [phase, setPhase] = useState<ScriptPhase>("pre")
  const [editing, setEditing] = useState(false)
  const [selectOpen, setSelectOpen] = useState(false)
  const [draft, setDraft] = useState<ScriptFields>({
    scripts: fields.scripts,
    tests: fields.tests,
  })
  const pending = useRef<ScriptFields | null>(null)
  const changeRef = useRef(onChange)
  changeRef.current = onChange
  useEffect(() => {
    if (!pending.current)
      setDraft({ scripts: fields.scripts, tests: fields.tests })
  }, [fields.scripts, fields.tests])
  const commit = useCallback(() => {
    if (pending.current && changeRef.current(pending.current))
      pending.current = null
  }, [])
  useEffect(() => () => commit(), [commit])
  useEffect(
    () =>
      keymap.intercept(
        "key",
        ({ event }) => {
          if (
            !focused ||
            editing ||
            selectOpen ||
            keymap.getData("app.overlay") !== "none"
          )
            return
          if (event.name !== "left" && event.name !== "right") return
          event.preventDefault()
          event.stopPropagation()
          commit()
          const index = SCRIPT_TABS.findIndex((tab) => tab.phase === phase)
          setPhase(
            SCRIPT_TABS[(index + (event.name === "left" ? 2 : 1)) % 3]!.phase,
          )
        },
        { priority: 130 },
      ),
    [keymap, focused, editing, selectOpen, phase, commit],
  )
  useEffect(() => {
    onEditingChange(focused && editing)
    return () => onEditingChange(false)
  }, [focused, editing, onEditingChange])
  useEffect(() => {
    if (!focused) {
      commit()
      setEditing(false)
    }
  }, [focused, commit])
  return (
    <box flexDirection="column" height={18} minHeight={6} flexGrow={1}>
      <Tabs
        tabs={SCRIPT_TABS.map((tab) => ({
          id: tab.phase,
          label:
            tab.phase === "tests"
              ? "Collection Tests"
              : `Collection ${tab.label}`,
        }))}
        activeId={phase}
        onChange={(value) => {
          commit()
          setEditing(false)
          setPhase(value as ScriptPhase)
          onFocus()
        }}
      >
        <ScriptEditor
          key={phase}
          value={scriptText(draft, phase)}
          phase={phase}
          source={{ scope: "collection", path: "settings.yml" }}
          focused={focused}
          editing={editing}
          onSelectOpenChange={setSelectOpen}
          onChange={(value) => {
            const next = withScript(draft, phase, value)
            pending.current = next
            setDraft(next)
          }}
          onActivate={() => {
            onFocus()
            setEditing(true)
          }}
          onExit={() => {
            commit()
            setEditing(false)
          }}
        />
      </Tabs>
    </box>
  )
}
