import type { CodeEditorRenderable } from "./CodeEditor"

declare module "@opentui/react" {
  interface OpenTUIComponents {
    "code-editor": typeof CodeEditorRenderable
  }
}
