import { createScriptSemanticChecker } from "./scriptSemanticChecker"
import type { ScriptDiagnosticsRequest } from "./scriptDiagnostics"

let checker: ReturnType<typeof createScriptSemanticChecker> | undefined
self.onmessage = ({ data }: MessageEvent<ScriptDiagnosticsRequest>) => {
  if (data.kind === "init") {
    checker = createScriptSemanticChecker(data.declarations, data.sourceLimit)
    return
  }
  if (data.kind === "clear") {
    checker?.clear()
    return
  }
  try {
    if (!checker) throw new Error("Checker not initialized")
    self.postMessage({
      id: data.id,
      result: checker.check(data.source, data.phase),
    })
  } catch {
    self.postMessage({ id: data.id, error: true })
  }
}
