import { useCallback, useContext, useEffect, useRef, useState } from "react"
import { useKeymap } from "@opentui/keymap/react"
import type { ScriptFields } from "../../schema"
import { SCRIPT_TABS, scriptText, withScript } from "../../scriptAuthoring"
import type { ScriptPhase } from "../../preRequestScript"
import { ScriptEditor, ScriptAuthoringContext } from "../editor/ScriptEditor"
import { Tabs } from "../Tabs"
import {
  formatCodeFields,
  type PrepareScriptFields,
} from "../editor/codeFormatting"
import { CodeFormattingContext } from "../editor/CodeFormattingContext"
import { showToast } from "../Toast"

export type SaveCollectionScripts = (
  patch: ScriptFields,
  prepare?: PrepareScriptFields,
) => Promise<boolean>

export function CollectionScripts({
  fields,
  pendingFields,
  focused,
  onFocus,
  onEditingChange,
  onChange,
}: {
  fields: ScriptFields
  pendingFields?: ScriptFields
  focused: boolean
  onFocus: () => void
  onEditingChange: (editing: boolean) => void
  onChange: SaveCollectionScripts
}) {
  const keymap = useKeymap()
  const context = useContext(ScriptAuthoringContext)
  const formattingTarget = useContext(CodeFormattingContext)
  const contextRef = useRef(context)
  contextRef.current = context
  const [phase, setPhase] = useState<ScriptPhase>("pre")
  const [editing, setEditing] = useState(false)
  const [selectOpen, setSelectOpen] = useState(false)
  const [draft, setDraft] = useState<ScriptFields>(
    pendingFields ?? { scripts: fields.scripts, tests: fields.tests },
  )
  const pending = useRef<ScriptFields | null>(pendingFields ?? null)
  const previousPendingFields = useRef(pendingFields)
  const saving = useRef<ScriptFields | null>(null)
  const changeRef = useRef(onChange)
  changeRef.current = onChange
  useEffect(() => {
    if (!pending.current || pending.current === previousPendingFields.current) {
      pending.current = pendingFields ?? null
      setDraft(
        pendingFields ?? { scripts: fields.scripts, tests: fields.tests },
      )
    }
    previousPendingFields.current = pendingFields
  }, [fields.scripts, fields.tests, pendingFields])
  const commit = useCallback(async () => {
    const snapshot = pending.current
    if (!snapshot || saving.current === snapshot) return
    saving.current = snapshot
    let savedSnapshot = snapshot
    let savedFields = snapshot
    const context = contextRef.current
    const diagnostics = context?.diagnostics
    const target = formattingTarget?.current
    const prepare: PrepareScriptFields | undefined =
      context?.formatOnSave && diagnostics
        ? async (fields) => {
            const result = await formatCodeFields(fields, diagnostics)
            savedFields = result.fields
            if (result.failed)
              showToast(
                "Formatting unavailable; saving unformatted scripts",
                "warning",
              )
            return {
              fields: result.fields,
              apply() {
                if (pending.current !== snapshot) return
                if (
                  target?.scope === "collection" &&
                  target.field !== "body" &&
                  formattingTarget?.current === target &&
                  target.editor.plainText === scriptText(fields, target.field)
                ) {
                  const changes = result.edits[target.field]
                  if (changes) target.editor.applyFormatting(changes)
                }
                // Formatting can emit an editor change for the saved snapshot.
                savedSnapshot = pending.current ?? snapshot
              },
            }
          }
        : undefined
    try {
      if (
        (await changeRef.current(snapshot, prepare)) &&
        pending.current === savedSnapshot
      ) {
        pending.current = null
        setDraft(savedFields)
      }
    } catch {
      // The save caller reports failures; keep the draft available for retry.
    } finally {
      if (saving.current === snapshot) saving.current = null
    }
  }, [formattingTarget])
  useEffect(
    () => () => {
      void commit()
    },
    [commit],
  )
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
          onFocus={onFocus}
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
