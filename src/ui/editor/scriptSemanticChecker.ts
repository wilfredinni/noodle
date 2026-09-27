import ts from "typescript-js"
import libraries from "./scriptTypeLibraries.json"
import { SCRIPT_WRAPPER_PREFIX } from "../../scriptAsync"
import type { ScriptPhase } from "../../preRequestScript"
import type {
  ScriptAssistance,
  ScriptCompletionContext,
  ScriptCompletionDetails,
  ScriptCompletionItem,
} from "./scriptCompletion"

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
    lib: Object.keys(libraries),
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

  const update = (text: string, nextPhase: ScriptPhase) => {
    if (Buffer.byteLength(text) > sourceLimit)
      throw new Error("source exceeds 256 KiB")
    if (files.has(scriptFile) && source === text && phase === nextPhase) return
    source = text
    phase = nextPhase
    version++
    files.set(
      scriptFile,
      ts.ScriptSnapshot.fromString(`${wrapperPrefix}${source}\n})()`),
    )
  }
  const display = ts.displayPartsToString
  const position = (cursor: number) =>
    wrapperPrefix.length + Math.max(0, Math.min(source.length, cursor))
  const details = (
    text: string,
    nextPhase: ScriptPhase,
    cursor: number,
    key: string,
  ): ScriptCompletionDetails => {
    update(text, nextPhase)
    const entry = service.getCompletionEntryDetails(
      scriptFile,
      position(cursor),
      key,
      undefined,
      undefined,
      undefined,
      undefined,
    )
    return entry
      ? {
          description: display(entry.documentation),
          signature: display(entry.displayParts),
        }
      : {}
  }

  return {
    details,
    assist(
      text: string,
      nextPhase: ScriptPhase,
      cursor: number,
      context: ScriptCompletionContext,
      explicit = false,
    ): ScriptAssistance {
      update(text, nextPhase)
      cursor = Math.max(0, Math.min(text.length, cursor))
      const pos = position(cursor)
      const info = service.getCompletionsAtPosition(scriptFile, pos, {
        includeCompletionsForModuleExports: false,
        includeCompletionsWithInsertText: true,
        includeCompletionsWithSnippetText: false,
        includeCompletionsWithClassMemberSnippets: false,
        includeCompletionsWithObjectLiteralMethodSnippets: false,
      })
      const help = service.getSignatureHelpItems(scriptFile, pos, undefined)
      const signature = help?.items[help.selectedItemIndex]
      const signatureHelp =
        signature && help
          ? {
              prefix: display(signature.prefixDisplayParts),
              parameters: signature.parameters.map((parameter) =>
                display(parameter.displayParts),
              ),
              separator: display(signature.separatorDisplayParts),
              suffix: display(signature.suffixDisplayParts),
              activeParameter: Math.min(
                help.argumentIndex,
                Math.max(0, signature.parameters.length - 1),
              ),
            }
          : undefined
      const program = service.getProgram()!
      const parsed = program.getSourceFile(scriptFile)!
      const types = program.getTypeChecker()
      let token: ts.Node = parsed
      let call: ts.CallExpression | undefined
      const visit = (node: ts.Node) => {
        if (node.getFullStart() > pos || node.end < pos) return
        token = node
        if (
          ts.isCallExpression(node) &&
          node.arguments.pos <= pos &&
          pos <= node.arguments.end
        )
          call = node
        ts.forEachChild(node, visit)
      }
      visit(parsed)
      const literal =
        ts.isStringLiteral(token) &&
        pos > token.getStart(parsed) &&
        (pos < token.end ||
          parsed.text[token.end - 1] !== parsed.text[token.getStart(parsed)])
          ? token
          : undefined
      const word = /[\w$]*$/.exec(text.slice(0, cursor))![0]
      const start = literal
        ? literal.getStart(parsed) + 1 - wrapperPrefix.length
        : cursor - word.length
      const quotedEnd =
        literal &&
        parsed.text[literal.end - 1] === parsed.text[literal.getStart(parsed)]
      const end = literal
        ? literal.end - wrapperPrefix.length - (quotedEnd ? 1 : 0)
        : cursor + (/^[\w$]*/.exec(text.slice(cursor))?.[0].length ?? 0)
      const quote = literal ? parsed.text[literal.getStart(parsed)]! : '"'
      const scanner = ts.createScanner(ts.ScriptTarget.Latest, false)
      scanner.setText(`${quote}${text.slice(start, cursor)}${quote}`)
      scanner.scan()
      const query = literal ? scanner.getTokenValue() : word
      const escape = (name: string) =>
        JSON.stringify(name)
          .slice(1, -1)
          .replaceAll("'", quote === "'" ? "\\'" : "'")
      const alreadyComplete =
        !explicit &&
        cursor === end &&
        info?.entries.some((entry) => entry.name === query)
      const items: ScriptCompletionItem[] = (info?.entries ?? []).flatMap(
        (entry) => {
          if (
            entry.hasAction ||
            entry.isSnippet ||
            entry.kind === ts.ScriptElementKind.warning ||
            entry.kind === ts.ScriptElementKind.scriptElement ||
            (entry.kind === ts.ScriptElementKind.keyword &&
              [
                "as",
                "export",
                "import",
                "package",
                "satisfies",
                "using",
                "with",
              ].includes(entry.name))
          )
            return []
          if (!entry.name.toLowerCase().includes(query.toLowerCase())) return []
          const span = entry.replacementSpan ?? info?.optionalReplacementSpan
          const itemStart = span ? span.start - wrapperPrefix.length : start
          const itemEnd = span ? itemStart + span.length : end
          if (itemStart < 0 || itemEnd > text.length) return []
          const insert = literal
            ? escape(entry.name)
            : (entry.insertText ?? entry.name)
          if (
            !explicit &&
            text.slice(itemStart, itemEnd) === insert &&
            cursor === itemEnd
          )
            return []
          return [
            {
              key: entry.name,
              label: entry.name,
              insert,
              start: itemStart,
              end: itemEnd,
            },
          ]
        },
      )
      // Collection suggestions are tied to the resolved declaration, including aliases.
      const declaration = call && types.getResolvedSignature(call)?.declaration
      if (
        declaration?.getSourceFile().fileName === apiFile &&
        help?.argumentIndex === 0
      ) {
        const path: string[] = []
        for (
          let node: ts.Node | undefined = declaration;
          node && !ts.isInterfaceDeclaration(node);
          node = node.parent
        ) {
          if (
            (ts.isMethodSignature(node) || ts.isPropertySignature(node)) &&
            ts.isIdentifier(node.name)
          )
            path.unshift(node.name.text)
        }
        const name = path.join(".")
        const names =
          name === "runRequest"
            ? context.requestIds
            : ["env.get", "run.get", "run.set", "run.unset"].includes(name)
              ? context.environmentKeys
              : []
        const first = call?.arguments[0]
        if (!first || literal === first) {
          for (const name of new Set(names)) {
            if (!name.toLowerCase().includes(query.toLowerCase())) continue
            items.push({
              key: `context:${name}`,
              label: name,
              insert: literal ? escape(name) : JSON.stringify(name),
              start,
              end,
              description:
                path[0] === "runRequest"
                  ? "Saved request ID."
                  : "Active environment key.",
            })
          }
        }
      }
      // Preserve Noodle's existing root shorthand without inventing local aliases.
      if (info?.isGlobalCompletion && word && !literal) {
        const noodle = types.resolveName(
          "noodle",
          token,
          ts.SymbolFlags.Value,
          false,
        )
        if (
          noodle?.declarations?.some(
            (node) => node.getSourceFile().fileName === apiFile,
          )
        ) {
          for (const member of types.getPropertiesOfType(
            types.getTypeOfSymbolAtLocation(noodle, token),
          )) {
            const name = `noodle.${member.name}`
            if (!name.toLowerCase().includes(query.toLowerCase())) continue
            items.push({
              key: `api:${member.name}`,
              label: name,
              insert: name,
              start,
              end,
              description: display(member.getDocumentationComment(types)),
              signature: types.typeToString(
                types.getTypeOfSymbolAtLocation(member, token),
              ),
            })
          }
        }
      }
      // Whitespace only requests signature help unless completion was explicitly invoked.
      const shouldSuggest =
        explicit ||
        !!literal ||
        !!word ||
        /[.?:{,]$/.test(text.slice(0, cursor).trimEnd())
      return {
        query,
        items: shouldSuggest && !alreadyComplete ? items : [],
        ...(signatureHelp ? { signatureHelp } : {}),
      }
    },
    check(text: string, nextPhase: ScriptPhase): ScriptDiagnostics {
      update(text, nextPhase)
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
