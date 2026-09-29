import ts from "typescript-js"
import {
  SCRIPT_API_CONTRACT,
  SCRIPT_LIMITS,
  validateScriptSyntax,
  type ScriptPhase,
} from "../preRequestScript"
import type { ImportWarning } from "./index"

// Deliberately narrower than QuickJS: no indirect global access or dynamic code.
export const SCRIPT_IMPORT_GLOBALS = Object.freeze([
  "undefined",
  "NaN",
  "Infinity",
  "Object",
  "Array",
  "String",
  "Number",
  "Boolean",
  "BigInt",
  "Symbol",
  "Math",
  "JSON",
  "Date",
  "RegExp",
  "Map",
  "Set",
  "WeakMap",
  "WeakSet",
  "Error",
  "TypeError",
  "RangeError",
  "SyntaxError",
  "ReferenceError",
  "URIError",
  "EvalError",
  "InternalError",
  "parseInt",
  "parseFloat",
  "isNaN",
  "isFinite",
  "encodeURI",
  "decodeURI",
  "encodeURIComponent",
  "decodeURIComponent",
])

export type ScriptCompatibility = {
  compatible: boolean
  unsupportedGlobals: string[]
  reason?: "syntax" | "unsupported-globals" | "unverifiable"
}

export async function scriptCompatibility(
  source: string,
  phase: ScriptPhase,
): Promise<ScriptCompatibility> {
  try {
    const analysis = analyzeScriptCompatibility(source, phase)
    if (
      analysis.compatible &&
      source.trim() &&
      (await validateScriptSyntax(source))
    )
      return { compatible: false, unsupportedGlobals: [], reason: "syntax" }
    return analysis
  } catch {
    return { compatible: false, unsupportedGlobals: [], reason: "unverifiable" }
  }
}

function analyzeScriptCompatibility(
  source: string,
  phase: ScriptPhase,
): ScriptCompatibility {
  const unsupported = new Set<string>()
  let uncertain = false
  const indirect = new Set([
    "constructor",
    "__proto__",
    "prototype",
    "getPrototypeOf",
    "setPrototypeOf",
    "getOwnPropertyDescriptor",
    "getOwnPropertyDescriptors",
  ])
  const reject = (
    reason: ScriptCompatibility["reason"],
  ): ScriptCompatibility => ({
    compatible: false,
    unsupportedGlobals: [...unsupported].sort(),
    reason,
  })
  if (Buffer.byteLength(source) > SCRIPT_LIMITS.sourceBytes)
    return reject("unverifiable")
  const file = ts.createSourceFile(
    "script.js",
    source,
    ts.ScriptTarget.ESNext,
    true,
    ts.ScriptKind.JS,
  )
  const program = ts.createProgram(
    [file.fileName],
    { allowJs: true, noLib: true, noResolve: true },
    {
      getSourceFile: (name) => (name === file.fileName ? file : undefined),
      getDefaultLibFileName: () => "",
      writeFile: () => {},
      getCurrentDirectory: () => "",
      getDirectories: () => [],
      fileExists: (name) => name === file.fileName,
      readFile: () => undefined,
      getCanonicalFileName: (name) => name,
      useCaseSensitiveFileNames: () => true,
      getNewLine: () => "\n",
    },
  )
  if (program.getSyntacticDiagnostics(file).length) return reject("syntax")
  if (ts.isExternalModule(file)) uncertain = true
  const checker = program.getTypeChecker()
  const entries = SCRIPT_API_CONTRACT.filter((entry) =>
    entry.phases.includes(phase),
  )
  const globals = new Set<string>([
    ...SCRIPT_IMPORT_GLOBALS,
    ...entries.map((entry) => entry.global),
  ])
  const paths = new Set(
    entries.map((entry) =>
      entry.member ? `${entry.global}.${entry.member}` : entry.global,
    ),
  )
  const local = (node: ts.Identifier) => {
    const symbol = ts.isShorthandPropertyAssignment(node.parent)
      ? checker.getShorthandAssignmentValueSymbol(node.parent)
      : checker.getSymbolAtLocation(node)
    return (
      symbol?.declarations?.some(
        (declaration) =>
          declaration.getSourceFile() === file &&
          (ts.isVariableDeclaration(declaration) ||
            ts.isBindingElement(declaration) ||
            ts.isParameter(declaration) ||
            ts.isFunctionDeclaration(declaration) ||
            ts.isFunctionExpression(declaration) ||
            ts.isClassDeclaration(declaration) ||
            ts.isClassExpression(declaration)),
      ) ?? false
    )
  }
  const apiPath = (node: ts.Node): string | undefined => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "expect" &&
      !local(node.expression)
    )
      return "expect"
    if (
      ts.isIdentifier(node) &&
      !local(node) &&
      entries.some((entry) => entry.global === node.text)
    )
      return node.text
    if (ts.isPropertyAccessExpression(node)) {
      const parent = apiPath(node.expression)
      if (parent)
        return `${parent === "expect.not" ? "expect" : parent}.${node.name.text}`
    }
    if (
      ts.isElementAccessExpression(node) &&
      ts.isStringLiteral(node.argumentExpression)
    ) {
      const parent = apiPath(node.expression)
      if (parent)
        return `${parent === "expect.not" ? "expect" : parent}.${node.argumentExpression.text}`
    }
    return undefined
  }
  const visit = (node: ts.Node) => {
    if (ts.isIdentifier(node)) {
      const parent = node.parent
      const key =
        (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
        ((ts.isPropertyAssignment(parent) ||
          ts.isMethodDeclaration(parent) ||
          ts.isPropertyDeclaration(parent)) &&
          parent.name === node) ||
        (ts.isBindingElement(parent) && parent.propertyName === node) ||
        ts.isLabeledStatement(parent) ||
        ts.isBreakOrContinueStatement(parent)
      if (!key && !local(node) && !globals.has(node.text))
        unsupported.add(node.text)
      if (
        node.text === "expect" &&
        !local(node) &&
        (ts.isPropertyAccessExpression(parent) ||
          ts.isElementAccessExpression(parent)) &&
        parent.expression === node
      )
        uncertain = true
    }
    if (
      ts.isPropertyAccessExpression(node) ||
      ts.isElementAccessExpression(node)
    ) {
      const name = ts.isPropertyAccessExpression(node)
        ? node.name.text
        : ts.isStringLiteral(node.argumentExpression)
          ? node.argumentExpression.text
          : undefined
      if (!name || indirect.has(name)) uncertain = true
    }
    // Reflection through destructuring is equally uncertain.
    if (
      ts.isBindingElement(node) ||
      ts.isPropertyAssignment(node) ||
      ts.isShorthandPropertyAssignment(node)
    ) {
      const key = ts.isBindingElement(node)
        ? (node.propertyName ?? node.name)
        : node.name
      if (
        ts.isComputedPropertyName(key) ||
        ((ts.isIdentifier(key) || ts.isStringLiteral(key)) &&
          indirect.has(key.text))
      )
        uncertain = true
    }
    const path = apiPath(node)
    if (path) {
      if (!paths.has(path)) uncertain = true
      // Async request results require data-flow analysis; leave these scripts unconverted.
      if (
        entries.some(
          (entry) =>
            `${entry.global}.${entry.member}` === path &&
            entry.signature.includes("): Promise<"),
        )
      )
        uncertain = true
      const parent = node.parent
      if (
        (ts.isBinaryExpression(parent) &&
          parent.left === node &&
          parent.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
          parent.operatorToken.kind <= ts.SyntaxKind.LastAssignment) ||
        ts.isDeleteExpression(parent) ||
        (ts.isPrefixUnaryExpression(parent) &&
          (parent.operator === ts.SyntaxKind.PlusPlusToken ||
            parent.operator === ts.SyntaxKind.MinusMinusToken)) ||
        ts.isPostfixUnaryExpression(parent)
      ) {
        if (
          !entries.some(
            (entry) =>
              `${entry.global}.${entry.member}` === path &&
              entry.writableIn?.includes(phase),
          )
        )
          uncertain = true
      }
      // Do not infer aliases/destructuring of API namespaces or methods.
      if (
        [...paths].some((candidate) => candidate.startsWith(`${path}.`)) ||
        entries.some(
          (entry) =>
            entry.kind === "method" &&
            `${entry.global}.${entry.member}` === path,
        )
      ) {
        const parent = node.parent
        if (
          !(
            (ts.isPropertyAccessExpression(parent) ||
              ts.isElementAccessExpression(parent)) &&
            parent.expression === node
          ) &&
          !(ts.isCallExpression(parent) && parent.expression === node)
        )
          uncertain = true
      }
    }
    if (
      node.kind === ts.SyntaxKind.ThisKeyword ||
      node.kind === ts.SyntaxKind.SuperKeyword ||
      node.kind === ts.SyntaxKind.ImportKeyword ||
      ts.isImportDeclaration(node) ||
      ts.isExportDeclaration(node) ||
      ts.isExportAssignment(node) ||
      ts.isWithStatement(node) ||
      ts.isMetaProperty(node) ||
      ts.isAwaitExpression(node) ||
      node.kind === ts.SyntaxKind.AsyncKeyword
    )
      uncertain = true
    ts.forEachChild(node, visit)
  }
  visit(file)
  if (unsupported.size) return reject("unsupported-globals")
  if (uncertain) return reject("unverifiable")
  return { compatible: true, unsupportedGlobals: [] }
}

export function unconvertedScriptWarning(
  format: ImportWarning["format"],
  itemPath: string[],
  phase: string,
  analysis?: ScriptCompatibility,
): ImportWarning {
  return {
    code: "foreign-script-not-converted",
    format,
    itemPath,
    phase,
    unsupportedGlobals: analysis?.unsupportedGlobals ?? [],
    reason: analysis?.reason ?? "unsupported-placement",
    message: analysis?.unsupportedGlobals.length
      ? `Unsupported script globals: ${analysis.unsupportedGlobals.join(", ")}. Script was not converted.`
      : "Script compatibility or placement could not be established; script was not converted.",
  }
}
