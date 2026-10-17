import { EnvSidebar } from "./EnvSidebar"
import { EnvHeaderPane, type EnvHeaderPaneHandle } from "./EnvHeaderPane"
import { EnvEditorPane } from "./EnvEditorPane"
import { useEffect, type RefObject } from "react"
import type { UseEnvironmentEditorResult } from "../../hooks/useEnvironmentEditor"
import type { Environment } from "../../schema"
import type { Focus } from "../focus"
import { EmptyState } from "../EmptyState"
import { FullBorder } from "../borders"

interface EnvironmentEditorViewProps {
  readOnly?: boolean
  envEditor: UseEnvironmentEditorResult
  activeEnv: Environment | null
  envColors: Record<string, string | undefined>
  focus: Focus
  envHeaderRef: RefObject<EnvHeaderPaneHandle | null>
  jumpMode?: boolean
  onHeaderFieldFocus?: (field: "name" | "color") => void
  onPaneFocus?: (focus: Focus) => void
  onCreateEnvironment: () => void
  onEnvironmentContextMenu?: (name: string) => void
  setEnvDeletePending: (name: string | null) => void
}

export function EnvironmentEditorView({
  envEditor,
  readOnly = false,
  activeEnv,
  envColors,
  focus,
  envHeaderRef,
  jumpMode = false,
  onHeaderFieldFocus,
  onPaneFocus = () => {},
  onCreateEnvironment,
  onEnvironmentContextMenu,
  setEnvDeletePending,
}: EnvironmentEditorViewProps) {
  const remaskSecrets = envEditor.remaskSecrets
  useEffect(() => {
    if (focus !== "env-vars") remaskSecrets()
  }, [focus, remaskSecrets])

  if (envEditor.envNames.length === 0) {
    return (
      <EmptyState
        border={FullBorder}
        actionActive={!readOnly}
        actionDisabled={readOnly}
        subtitle="No environments in this collection"
        message="Create environment"
        onAction={() => {
          if (!readOnly) onCreateEnvironment()
        }}
      />
    )
  }

  return (
    <box style={{ flexDirection: "row", flexGrow: 1, gap: 1, minHeight: 0 }}>
      <EnvSidebar
        envNames={envEditor.envNames}
        selectedEnvName={envEditor.selectedEnvName}
        activeEnvName={activeEnv?.name}
        envColors={envColors}
        dirty={envEditor.dirty}
        onSelectEnv={envEditor.selectEnv}
        onCreate={() => {
          if (readOnly) return
          envEditor.openEditor()
          onPaneFocus("env-vars")
        }}
        onClone={() => {
          if (readOnly) return
          if (envEditor.selectedEnvName) {
            const target = `${envEditor.selectedEnvName} - Copy`
            envEditor.cloneEnv(target)
          }
        }}
        onDelete={() => {
          if (readOnly) return
          if (envEditor.selectedEnvName) {
            setEnvDeletePending(envEditor.selectedEnvName)
          }
        }}
        focused={focus === "env-sidebar"}
        jumpMode={jumpMode}
        onPaneFocus={() => {
          envEditor.remaskSecrets()
          onPaneFocus("env-sidebar")
        }}
        onEnvironmentContextMenu={onEnvironmentContextMenu}
      />
      <box
        style={{
          flexDirection: "column",
          flexGrow: 1,
          gap: 0,
          minHeight: 0,
        }}
      >
        <EnvHeaderPane
          ref={envHeaderRef}
          readOnly={readOnly}
          name={envEditor.draft?.name ?? ""}
          color={envEditor.draft?.color}
          onNameChange={envEditor.setName}
          onColorChange={envEditor.setColor}
          focused={focus === "env-header"}
          jumpMode={jumpMode}
          onColorFocus={() => onHeaderFieldFocus?.("color")}
          onPaneFocus={() => {
            envEditor.remaskSecrets()
            onPaneFocus("env-header")
          }}
        />
        <EnvEditorPane
          draft={envEditor.draft}
          editState={
            readOnly
              ? { ...envEditor.editState, mode: "inactive" }
              : envEditor.editState
          }
          editKey={envEditor.editKey}
          editValue={envEditor.editValue}
          setEditKey={(value) => {
            if (!readOnly) envEditor.setEditKey(value)
          }}
          setEditValue={(value) => {
            if (!readOnly) envEditor.setEditValue(value)
          }}
          saving={envEditor.saving}
          error={envEditor.error}
          focused={focus === "env-vars"}
          jumpMode={jumpMode}
          onPaneFocus={() => onPaneFocus("env-vars")}
          onInteraction={readOnly ? undefined : envEditor.commitEdit}
          onActivateRow={(row, addingRow, subfield) => {
            onPaneFocus("env-vars")
            if (readOnly) return
            envEditor.activateVar(row, addingRow, subfield)
          }}
          onToggleRow={(row) => {
            onPaneFocus("env-vars")
            if (readOnly) return
            envEditor.commitEdit()
            envEditor.toggleVar(row)
          }}
          onToggleSecret={(row) => {
            onPaneFocus("env-vars")
            if (readOnly) return
            envEditor.commitEdit()
            envEditor.toggleSecret(row)
          }}
          onRevealSecret={readOnly ? undefined : envEditor.toggleReveal}
          revealedRowId={envEditor.revealedRowId}
          clonePrompt={envEditor.clonePrompt}
        />
      </box>
    </box>
  )
}
