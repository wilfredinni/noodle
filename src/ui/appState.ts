import type { Focus } from "./focus"
import type { UpdateAvailableInfo } from "../app/commands/update"

export type AppView = "main" | "env-editor" | "settings"

export interface YamlEditorState {
  visible: boolean
  filePath: string
  requestName: string
  requestId: string
  kind: "request" | "folder"
  returnFocus: Focus
  folderPath: string
}

export const initialYamlEditorState: YamlEditorState = {
  visible: false,
  filePath: "",
  requestName: "",
  requestId: "",
  kind: "request",
  returnFocus: "sidebar",
  folderPath: "",
}

export type UpdateFlowState =
  | { phase: "idle" }
  | ({ phase: "confirm" } & UpdateAvailableInfo)
  | ({ phase: "installing" } & UpdateAvailableInfo)
  | { phase: "done"; version: string }
  | { phase: "failed"; message: string }
