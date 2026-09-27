import ts from "typescript-js"
import libraries from "./scriptTypeLibraries.json"
import { SCRIPT_WRAPPER_PREFIX } from "../../scriptAsync"
import type { ScriptPhase } from "../../preRequestScript"

export type ScriptDiagnostic = {
  code: number
  message: string
  line: number
  column: number
}
export type ScriptDiagnostics = { first?: ScriptDiagnostic; count: number }

const scriptFile = "/script.js"
const apiFile = "/noodle.d.ts"
// Put source on its own line so leading JSDoc attaches to the user's declaration.
const wrapperPrefix = `${SCRIPT_WRAPPER_PREFIX}\n`

export function createScriptSemanticChecker(
  declarations: Record<ScriptPhase, string>,
  sourceLimit: number,
) {
  let source = ""
  let phase: ScriptPhase = "pre"
  let version = 0
  const files = new Map(
    Object.entries(libraries).map(([name, text]) => [
      `/${name}`,
      ts.ScriptSnapshot.fromString(text),
    ]),
  )
  const api = Object.fromEntries(
    Object.entries(declarations).map(([key, text]) => [
      key,
      ts.ScriptSnapshot.fromString(
        `${text}\ndeclare class InternalError extends Error {}`,
      ),
    ]),
  ) as Record<ScriptPhase, ts.IScriptSnapshot>
  const options: ts.CompilerOptions = {
    allowJs: true,
    checkJs: true,
    noEmit: true,
    strict: false,
    noImplicitAny: false,
    strictNullChecks: false,
    noUnusedLocals: false,
    noUnusedParameters: false,
    skipLibCheck: true,
    types: [],
    target: ts.ScriptTarget.ES2023,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    lib: [
      "lib.es2023.d.ts",
      "lib.es2025.iterator.d.ts",
      "lib.es2025.float16.d.ts",
    ],
  }
  const host: ts.LanguageServiceHost = {
    getCompilationSettings: () => options,
    getScriptFileNames: () => [scriptFile, apiFile],
    getScriptVersion: (name) =>
      name === scriptFile || name === apiFile ? String(version) : "0",
    getScriptSnapshot: (name) =>
      name === apiFile ? api[phase] : files.get(name),
    getCurrentDirectory: () => "/",
    getDefaultLibFileName: () => "/lib.es2023.d.ts",
    fileExists: (name) => name === apiFile || files.has(name),
    readFile: (name) => {
      const snapshot = host.getScriptSnapshot(name)
      return snapshot?.getText(0, snapshot.getLength())
    },
    readDirectory: () => [],
    directoryExists: (name) => name === "/",
    resolveModuleNames: (names) => names.map(() => undefined),
  }
  const service = ts.createLanguageService(host)

  return {
    check(text: string, nextPhase: ScriptPhase): ScriptDiagnostics {
      if (Buffer.byteLength(text) > sourceLimit)
        throw new Error("source exceeds 256 KiB")
      source = text
      phase = nextPhase
      version++
      files.set(
        scriptFile,
        ts.ScriptSnapshot.fromString(`${wrapperPrefix}${source}\n})()`),
      )
      const diagnostics = service.getSemanticDiagnostics(scriptFile)
      const program = service.getProgram()!
      const parsed = program.getSourceFile(scriptFile)!
      const types = program.getTypeChecker()
      const add = (node: ts.Node, code: number, messageText: string) => {
        const start = node.getStart(parsed)
        const end = node.end
        for (let index = diagnostics.length - 1; index >= 0; index--) {
          const position = diagnostics[index]!.start
          if (position !== undefined && position >= start && position < end)
            diagnostics.splice(index, 1)
        }
        diagnostics.push({
          file: parsed,
          start,
          length: end - start,
          category: ts.DiagnosticCategory.Error,
          code,
          messageText,
        })
      }
      const visit = (node: ts.Node) => {
        if (
          ts.isCallExpression(node) &&
          node.expression.kind === ts.SyntaxKind.ImportKeyword
        ) {
          add(node, 90001, "Module loading is unavailable in Noodle scripts.")
          return
        }
        if (
          ts.isPropertyAccessExpression(node) ||
          ts.isElementAccessExpression(node)
        ) {
          const target = types.getTypeAtLocation(node.expression)
          const symbol = target.getSymbol()
          const apiType = symbol?.declarations?.some(
            (declaration) => declaration.getSourceFile().fileName === apiFile,
          )
          // checkJs with noImplicitAny disabled otherwise permits misspelled
          // bracket access and unknown globalThis members. Resolve types, not spelling.
          if (apiType || symbol?.getName() === "globalThis") {
            const keyType = ts.isElementAccessExpression(node)
              ? types.getTypeAtLocation(node.argumentExpression)
              : undefined
            const key = ts.isPropertyAccessExpression(node)
              ? node.name.text
              : keyType?.isStringLiteral()
                ? keyType.value
                : undefined
            if (
              key !== undefined &&
              !types.getPropertyOfType(target, key) &&
              !target.getStringIndexType() &&
              !diagnostics.some(
                (diagnostic) =>
                  diagnostic.start !== undefined &&
                  diagnostic.start >= node.getStart(parsed) &&
                  diagnostic.start < node.end,
              )
            )
              add(
                node,
                90002,
                `Property '${key}' is unavailable on this Noodle script API.`,
              )
          }
        }
        ts.forEachChild(node, visit)
      }
      visit(parsed)
      const normalized = diagnostics
        .flatMap((diagnostic) => {
          const start = (diagnostic.start ?? -1) - wrapperPrefix.length
          if (start < 0 || start >= source.length) return []
          const position = parsed.getLineAndCharacterOfPosition(
            diagnostic.start!,
          )
          let message = ts.flattenDiagnosticMessageText(
            diagnostic.messageText,
            " ",
          )
          // Compiler environment setup advice is irrelevant to the sandbox.
          if (/types|tsconfig|compiler option/.test(message))
            message =
              message.match(/^Cannot find name '[^']*'\./)?.[0] ?? message
          return [
            {
              code: diagnostic.code,
              message,
              line: position.line,
              column: position.character + 1,
              start,
            },
          ]
        })
        .sort((a, b) => a.start - b.start || a.code - b.code)
      const first = normalized[0]
      return {
        count: normalized.length,
        ...(first
          ? {
              first: {
                code: first.code,
                message: first.message,
                line: first.line,
                column: first.column,
              },
            }
          : {}),
      }
    },
    clear() {
      source = ""
      files.delete(scriptFile)
      version++
      service.cleanupSemanticCache()
    },
    dispose() {
      service.dispose()
      files.clear()
    },
  }
}
