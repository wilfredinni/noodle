import { createContext, useContext, useEffect, type RefObject } from "react"
import type { CodeEditorRenderable } from "./CodeEditor"
import type { ScriptPhase, ScriptSource } from "../../preRequestScript"

export type FormattingTarget = {
  editor: CodeEditorRenderable
  field: "body" | ScriptPhase
  scope: ScriptSource["scope"]
}

export const CodeFormattingContext =
  createContext<RefObject<FormattingTarget | null> | null>(null)

export function useFormattingTarget(
  editor: CodeEditorRenderable | null,
  active: boolean,
  field: FormattingTarget["field"],
  scope: FormattingTarget["scope"],
) {
  const target = useContext(CodeFormattingContext)
  useEffect(() => {
    if (!target || !editor || !active) return
    const current = { editor, field, scope }
    target.current = current
    return () => {
      if (target.current === current) target.current = null
    }
  }, [target, editor, active, field, scope])
}
