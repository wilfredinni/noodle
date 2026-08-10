import { readdir, realpath, stat } from "node:fs/promises"
import { homedir } from "node:os"
import { join, relative, resolve, sep } from "node:path"

export type PathCompletionKind = "file" | "directory"

export interface PathCompletionOptions {
  kind: PathCompletionKind
  root?: string
  relativeRoot?: string
  wrapFileSelection?: boolean
}

export interface PathCompletionItem {
  name: string
  type: PathCompletionKind
  value: string
}

export interface PathCompletionQuery {
  root: string
  directory: string
  query: string
  valueBase: string
}

export function getPathCompletionQuery(
  value: string,
  root = homedir(),
  relativeRoot?: string,
): PathCompletionQuery | null {
  let pathValue = value
  if (pathValue.startsWith("@file(")) {
    pathValue = pathValue.slice(6)
    if (pathValue.endsWith(")")) pathValue = pathValue.slice(0, -1)
  }
  const isHomePath = pathValue.startsWith("@")
  const isRelativePath =
    relativeRoot !== undefined && pathValue.startsWith("./")
  if (!isHomePath && !isRelativePath) return null

  const completionRoot = resolve(isHomePath ? root : relativeRoot!)
  const raw = isHomePath
    ? pathValue.slice(1).replace(/^\//, "")
    : pathValue.slice(2)
  const slash = raw.lastIndexOf("/")
  const directoryPart = slash === -1 ? "" : raw.slice(0, slash)
  const query = slash === -1 ? raw : raw.slice(slash + 1)
  const directory = resolve(completionRoot, directoryPart || ".")
  const rel = relative(completionRoot, directory)

  if (rel === ".." || rel.startsWith(`..${sep}`)) {
    return null
  }

  return {
    root: completionRoot,
    directory,
    query,
    valueBase: isHomePath
      ? directoryPart
        ? `@/${directoryPart}/`
        : "@/"
      : directoryPart
        ? `./${directoryPart}/`
        : "./",
  }
}

export async function listPathCompletions(
  value: string,
  options: PathCompletionOptions,
): Promise<PathCompletionItem[]> {
  const root = resolve(options.root ?? homedir())
  const query = getPathCompletionQuery(value, root, options.relativeRoot)
  if (!query) return []

  const [realRoot, realDirectory] = await Promise.all([
    realpath(query.root),
    realpath(query.directory),
  ])
  if (!isWithin(realRoot, realDirectory)) return []

  const entries = await readdir(query.directory, { withFileTypes: true })
  const items = await Promise.all(
    entries.map(async (entry): Promise<PathCompletionItem | null> => {
      let type: PathCompletionKind | null = entry.isDirectory()
        ? "directory"
        : entry.isFile()
          ? "file"
          : null

      if (entry.isSymbolicLink()) {
        try {
          const entryPath = join(query.directory, entry.name)
          const targetPath = await realpath(entryPath)
          if (!isWithin(realRoot, targetPath)) return null
          const target = await stat(entryPath)
          type = target.isDirectory()
            ? "directory"
            : target.isFile()
              ? "file"
              : null
        } catch {
          return null
        }
      }

      if (!type || (options.kind === "directory" && type === "file")) {
        return null
      }

      const needle = query.query.toLocaleLowerCase()
      const name = entry.name.toLocaleLowerCase()
      if (entry.name.startsWith(".") && !query.query.startsWith(".")) {
        return null
      }
      if (!name.includes(needle)) return null

      return {
        name: entry.name,
        type,
        value: `${query.valueBase}${entry.name}${type === "directory" ? "/" : ""}`,
      }
    }),
  )

  const needle = query.query.toLocaleLowerCase()
  return items
    .filter((item): item is PathCompletionItem => item !== null)
    .sort((a, b) => {
      const aPrefix = a.name.toLocaleLowerCase().startsWith(needle)
      const bPrefix = b.name.toLocaleLowerCase().startsWith(needle)
      if (aPrefix !== bPrefix) return aPrefix ? -1 : 1
      if (a.type !== b.type) return a.type === "directory" ? -1 : 1
      return a.name.localeCompare(b.name)
    })
}

function isWithin(root: string, candidate: string): boolean {
  const rel = relative(root, candidate)
  return rel !== ".." && !rel.startsWith(`..${sep}`)
}
