import type { CodeEditorRenderable } from "./editor/CodeEditor"
import type { JsonBodyRenderable } from "./editor/JsonBodyViewer"

declare module "@opentui/react" {
  interface OpenTUIComponents {
    "code-editor": typeof CodeEditorRenderable
    "json-body": typeof JsonBodyRenderable
  }
}
