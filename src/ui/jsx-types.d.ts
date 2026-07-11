import type { CodeEditorRenderable } from "./editor/CodeEditor"

declare module "@opentui/react" {
  interface OpenTUIComponents {
    "code-editor": typeof CodeEditorRenderable
  }
}
