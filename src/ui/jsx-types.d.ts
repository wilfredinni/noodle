import type {
  CodeEditorRenderable,
  CodeEditorScrollBarRenderable,
} from "./editor/CodeEditor"
import type { JsonBodyRenderable } from "./editor/JsonBodyViewer"

declare module "@opentui/react" {
  interface OpenTUIComponents {
    "code-editor": typeof CodeEditorRenderable
    "code-editor-scrollbar": typeof CodeEditorScrollBarRenderable
    "json-body": typeof JsonBodyRenderable
  }
}
