import type { Collection } from "../schema"
import type { RunnerRetention } from "../runnerSession"
import type { ResponseExecutionResults } from "../executionResults"
import type { ScriptSource } from "../preRequestScript"
import { SCRIPT_TABS, type ScriptField } from "../scriptAuthoring"
import { findFolderByPath, findRequestById } from "./tree"

export interface RunnerSourceTarget {
  tab: ScriptField | "assertions" | "captures"
  source?: ScriptSource
}

export function runnerResultSources(
  execution: ResponseExecutionResults | undefined,
  index: number,
  retention?: RunnerRetention,
): RunnerSourceTarget[] {
  if (retention?.resultsOmitted) {
    const phase = retention.phase
    return phase
      ? [
          {
            tab:
              phase === "assertions" || phase === "captures"
                ? phase
                : SCRIPT_TABS.find((tab) => tab.phase === phase)!.id,
            source: retention.source,
          },
        ]
      : []
  }
  const scripts = execution?.scripts?.evaluated ? execution.scripts.results : []
  const assertions = execution?.assertions?.evaluated
    ? execution.assertions.results
    : []
  const captures = execution?.captures?.evaluated
    ? execution.captures.results
    : []
  const script = scripts[index]
  if (script)
    return [
      {
        tab: SCRIPT_TABS.find((tab) => tab.phase === script.phase)!.id,
        source: script.source,
      },
    ]
  index -= scripts.length
  if (index < assertions.length) return [{ tab: "assertions" }]
  index -= assertions.length
  if (index < captures.length) return [{ tab: "captures" }]
  index -= captures.length
  const tests = execution?.tests
  if (!tests?.evaluated) return []
  if (index > 0)
    return [{ tab: "tests", source: tests.results[index - 1]?.source }]
  const errors = tests.errors ?? (tests.error ? [tests.error] : [])
  const origins = errors.length ? errors : (tests.invocations ?? [])
  const targets = origins.map((result) => ({
    tab: "tests" as const,
    source: result.source,
  }))
  return targets.length
    ? [
        ...new Map(
          targets.map((target) => [JSON.stringify(target), target]),
        ).values(),
      ]
    : [{ tab: "tests" }]
}

export function resolveRunnerSource(
  collection: Collection | null,
  requestId: string,
  target?: RunnerSourceTarget,
) {
  if (!collection) return null
  const source = target?.source
  const tab = target?.tab
  if (source?.scope === "collection")
    return { scope: "collection" as const, tab }
  if (source?.scope === "folder") {
    const id = source.scopeId
    return id && findFolderByPath(collection.items, id)
      ? { scope: "folder" as const, id, tab }
      : null
  }
  const id = source?.scopeId ?? requestId
  return findRequestById(collection.items, id)
    ? { scope: "request" as const, id, tab }
    : null
}
