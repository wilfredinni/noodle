import { EnvSidebar } from "./EnvSidebar"
import { EnvHeaderPane, type EnvHeaderPaneHandle } from "./EnvHeaderPane"
import { EnvEditorPane } from "./EnvEditorPane"
import type { RefObject } from "react"
import type { UseEnvironmentEditorResult } from "../../hooks/useEnvironmentEditor"
import type { Environment } from "../../schema"
import type { Focus } from "../focus"

interface EnvironmentEditorViewProps {
  envEditor: UseEnvironmentEditorResult
  activeEnv: Environment | null
  envColors: Record<string, string | undefined>
  focus: Focus
  envHeaderRef: RefObject<EnvHeaderPaneHandle | null>
  onPaneFocus?: (focus: Focus) => void
  setEnvDeletePending: (name: string | null) => void
}

export function EnvironmentEditorView({
  envEditor,
  activeEnv,
  envColors,
  focus,
  envHeaderRef,
  onPaneFocus = () => {},
  setEnvDeletePending,
}: EnvironmentEditorViewProps) {
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
          envEditor.openEditor()
          onPaneFocus("env-vars")
        }}
        onClone={() => {
          if (envEditor.selectedEnvName) {
            const target = `${envEditor.selectedEnvName} - Copy`
            envEditor.cloneEnv(target)
          }
        }}
        onDelete={() => {
          if (envEditor.selectedEnvName) {
            setEnvDeletePending(envEditor.selectedEnvName)
          }
        }}
        focused={focus === "env-sidebar"}
        onPaneFocus={() => onPaneFocus("env-sidebar")}
      />
      <box
        style={{
          flexDirection: "column",
          flexGrow: 1,
          gap: 1,
          minHeight: 0,
        }}
      >
        <EnvHeaderPane
          ref={envHeaderRef}
          name={envEditor.draft?.name ?? ""}
          color={envEditor.draft?.color}
          onNameChange={envEditor.setName}
          onColorChange={envEditor.setColor}
          focused={focus === "env-header"}
          onPaneFocus={() => onPaneFocus("env-header")}
        />
        <EnvEditorPane
          draft={envEditor.draft}
          editState={envEditor.editState}
          editKey={envEditor.editKey}
          editValue={envEditor.editValue}
          setEditKey={envEditor.setEditKey}
          setEditValue={envEditor.setEditValue}
          saving={envEditor.saving}
          error={envEditor.error}
          focused={focus === "env-vars"}
          onPaneFocus={() => onPaneFocus("env-vars")}
        />
      </box>
    </box>
  )
}
