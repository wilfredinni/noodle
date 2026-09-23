import type { Collection, Request, ScriptFields } from "./schema"
import type { PreRequestScriptResult, ScriptSource } from "./preRequestScript"
import { findFolderByPath } from "./ui/tree"

export function requestScriptBlocks(
  request: Request,
  collection?: Collection,
  path = request.id,
) {
  const blocks: (ScriptFields & { source: ScriptSource })[] = []
  if (collection) {
    blocks.push({
      scripts: collection.scripts,
      tests: collection.tests,
      source: {
        scope: "collection",
        scopeId: collection.id,
        path: "settings.yml",
      },
    })
    const parts = path.split("/")
    for (let index = 1; index < parts.length; index++) {
      const folderPath = parts.slice(0, index).join("/")
      const folder = findFolderByPath(collection.items, folderPath)
      if (folder)
        blocks.push({
          scripts: folder.scripts,
          tests: folder.tests,
          source: {
            scope: "folder",
            scopeId: folderPath,
            path: `${folderPath}/folder.yml`,
          },
        })
    }
  }
  blocks.push({
    scripts: request.scripts,
    tests: request.tests,
    source: { scope: "request", scopeId: path, path: `${path}.yml` },
  })
  return blocks.filter((block) => block.scripts || block.tests !== undefined)
}

export function labelScriptResult(
  result: PreRequestScriptResult,
  source: ScriptSource,
): void {
  result.result.scope = source.scope
  result.result.source = source
  result.result.sourceKind = source.sourceKind ?? "inline"
  result.result.logs = result.result.logs.map((log) => ({ ...log, source }))
  if (result.result.error) result.result.error.source = source
  if (result.tests)
    result.tests = result.tests.map((test) => ({ ...test, source }))
}

export function scriptSourceLabel(source?: ScriptSource): string {
  return source
    ? `${source.scope}: ${source.scopeId ?? source.path}${source.sourcePath ? ` (${source.sourcePath})` : ""}`
    : ""
}
