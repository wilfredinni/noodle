import { constants } from "node:fs"
import { open, realpath, stat } from "node:fs/promises"
import { isAbsolute, relative, resolve, sep } from "node:path"
import {
  isExternalScriptSource,
  validateScriptSource,
} from "./lang/scriptSource"
import {
  SCRIPT_LIMITS,
  validateScriptSyntax,
  type ScriptSource,
} from "./preRequestScript"
import { requestScriptBlocks, scriptSourceLabel } from "./scriptInheritance"

export class ScriptSourceError extends Error {
  override name = "ScriptSourceError"
}

export type ResolvedScriptSource = { text: string; source: ScriptSource }
export type ResolvedScriptBlock = {
  pre?: ResolvedScriptSource
  post?: ResolvedScriptSource
  tests?: ResolvedScriptSource
}
export type ScriptSourceResolver = ReturnType<typeof createScriptSourceResolver>

// One instance belongs to one top-level send/run, including its saved children.
export function createScriptSourceResolver(
  collectionDir?: string,
  syntaxPreflight = false,
) {
  let root: Promise<string> | undefined
  const declarations = new Map<string, Promise<string>>()
  const files = new Map<string, Promise<string>>()
  const inside = (base: string, target: string) => {
    const path = relative(base, target)
    return (
      path !== "" &&
      path !== ".." &&
      !path.startsWith(`..${sep}`) &&
      !isAbsolute(path)
    )
  }
  const read = async (base: string, target: string): Promise<string> => {
    const before = await stat(target)
    if (!before.isFile()) throw new Error("source must be a regular file")
    const file = await open(
      target,
      constants.O_RDONLY |
        (process.platform === "win32"
          ? 0
          : (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0)),
    )
    try {
      const opened = await file.stat()
      const current = await realpath(target)
      const after = await stat(current)
      if (
        !opened.isFile() ||
        !inside(base, current) ||
        current !== target ||
        opened.dev !== before.dev ||
        opened.ino !== before.ino ||
        opened.dev !== after.dev ||
        opened.ino !== after.ino
      )
        throw new Error("source changed while being resolved")
      if (opened.size > SCRIPT_LIMITS.sourceBytes)
        throw new Error("source exceeds 256 KiB")
      const bytes = Buffer.alloc(SCRIPT_LIMITS.sourceBytes + 1)
      let size = 0
      while (size < bytes.length) {
        const { bytesRead } = await file.read(
          bytes,
          size,
          bytes.length - size,
          null,
        )
        if (!bytesRead) break
        size += bytesRead
      }
      if (size > SCRIPT_LIMITS.sourceBytes)
        throw new Error("source exceeds 256 KiB")
      try {
        return new TextDecoder("utf-8", { fatal: true }).decode(
          bytes.subarray(0, size),
        )
      } catch {
        throw new Error("source must be valid UTF-8")
      }
    } finally {
      await file.close()
    }
  }
  const load = async (declaration: string): Promise<string> => {
    if (!collectionDir) throw new Error("source requires a collection root")
    const base = await (root ??= realpath(collectionDir))
    const target = await realpath(resolve(base, declaration))
    if (!inside(base, target))
      throw new Error("source is outside the collection root")
    let text = files.get(target)
    if (!text) {
      text = read(base, target)
      files.set(target, text)
    }
    return text
  }
  const resolveSource = async (
    declaration: string,
    origin: ScriptSource,
  ): Promise<ResolvedScriptSource> => {
    try {
      validateScriptSource(declaration)
      if (!isExternalScriptSource(declaration))
        return {
          text: declaration,
          source: { ...origin, sourceKind: "inline" },
        }
      let text = declarations.get(declaration)
      if (!text) {
        text = load(declaration)
        declarations.set(declaration, text)
      }
      return {
        text: await text,
        source: { ...origin, sourceKind: "external", sourcePath: declaration },
      }
    } catch (error) {
      // OS errors include host paths, including in `cause` when inspected.
      // Only our fixed reasons may cross this boundary; omit the original cause.
      const reasons = [
        "source must be a regular file",
        "source changed while being resolved",
        "source exceeds 256 KiB",
        "source must be valid UTF-8",
        "source requires a collection root",
        "source is outside the collection root",
      ]
      const reason =
        error instanceof Error && reasons.includes(error.message)
          ? error.message
          : "source is invalid, missing, or unreadable"
      throw new ScriptSourceError(
        `Script source configuration error: ${scriptSourceLabel(origin)}: ${reason}${isExternalScriptSource(declaration) && !/[\0\r\n]/.test(declaration) ? ` (${JSON.stringify(declaration)})` : ""}`,
      )
    }
  }
  const syntax = new Map<string, ReturnType<typeof validateScriptSyntax>>()
  const validate = async (resolved: ResolvedScriptSource) => {
    let parsed = syntax.get(resolved.text)
    if (!parsed) {
      parsed = validateScriptSyntax(resolved.text)
      syntax.set(resolved.text, parsed)
    }
    const error = await parsed
    if (error)
      throw new ScriptSourceError(
        `${scriptSourceLabel(resolved.source)}: ${error.name} at ${error.line ?? 1}:${error.column ?? 1}: ${error.message}`,
      )
  }
  return {
    resolve: resolveSource,
    async resolveFile(
      declaration: string,
      origin: ScriptSource,
    ): Promise<string> {
      if (!isExternalScriptSource(declaration))
        throw new ScriptSourceError("Select an external script first")
      await resolveSource(declaration, origin)
      // The validated realpath stays host-side, never in diagnostic origins.
      const base = await root!
      const target = await realpath(resolve(base, declaration)).catch(
        () => undefined,
      )
      if (!target || !inside(base, target) || !files.has(target))
        throw new ScriptSourceError(
          "Script source changed while being resolved",
        )
      return target
    },
    async resolveBlocks(
      blocks: ReturnType<typeof requestScriptBlocks>,
    ): Promise<ResolvedScriptBlock[]> {
      const resolved: ResolvedScriptBlock[] = []
      for (const block of blocks) {
        const result: ResolvedScriptBlock = {}
        for (const phase of ["pre", "post", "tests"] as const) {
          const source =
            phase === "tests" ? block.tests : block.scripts?.[phase]
          if (source !== undefined) {
            result[phase] = await resolveSource(source, block.source)
            if (syntaxPreflight) await validate(result[phase]!)
          }
        }
        resolved.push(result)
      }
      return resolved
    },
  }
}
