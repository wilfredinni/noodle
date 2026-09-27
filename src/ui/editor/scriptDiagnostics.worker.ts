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
    const result =
      data.kind === "check"
        ? checker.check(data.source, data.phase)
        : data.kind === "assist"
          ? checker.assist(
              data.source,
              data.phase,
              data.cursor,
              data.context,
              data.explicit,
            )
          : checker.details(data.source, data.phase, data.cursor, data.key)
    self.postMessage({ id: data.id, result })
  } catch {
    self.postMessage({ id: data.id, error: true })
  }
}
