import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import ts from "typescript-js"

// Embed only ECMAScript declarations. Never resolve types from a user's project.
const root = dirname(
  fileURLToPath(import.meta.resolve("typescript-js/package.json")),
)
const libraries: Record<string, string> = {}
async function include(name: string): Promise<void> {
  if (name in libraries) return
  const source = await Bun.file(join(root, "lib", name)).text()
  libraries[name] = source
  for (const reference of source.matchAll(/<reference lib="([^"]+)"/g))
    await include(`lib.${reference[1]}.d.ts`)
  const parsed = ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true)
  // QuickJS has neither Intl nor Atomics. Keep supporting type declarations.
  let filtered = source
  for (const statement of [...parsed.statements].reverse()) {
    if (
      (ts.isModuleDeclaration(statement) && statement.name.text === "Intl") ||
      (ts.isVariableStatement(statement) &&
        statement.declarationList.declarations.some(
          (declaration) =>
            ts.isIdentifier(declaration.name) &&
            declaration.name.text === "Atomics",
        ))
    )
      filtered =
        filtered.slice(0, statement.pos) + filtered.slice(statement.end)
  }
  libraries[name] = filtered
}
await include("lib.es2023.d.ts")
await include("lib.es2024.arraybuffer.d.ts")
await include("lib.es2024.collection.d.ts")
await include("lib.es2024.object.d.ts")
await include("lib.es2024.promise.d.ts")
await include("lib.es2024.regexp.d.ts")
await include("lib.es2024.sharedmemory.d.ts")
await include("lib.es2024.string.d.ts")
await include("lib.es2025.collection.d.ts")
await include("lib.es2025.promise.d.ts")
await include("lib.es2025.regexp.d.ts")
await include("lib.es2025.iterator.d.ts")
await include("lib.es2025.float16.d.ts")
await include("lib.esnext.collection.d.ts")
await include("lib.esnext.error.d.ts")
// Shipped QuickJS helpers that the pinned TypeScript libraries do not yet declare.
libraries["lib.quickjs.d.ts"] = `
interface Math {
  /** Sums an iterable of numbers with improved precision. */
  sumPrecise(values: Iterable<number>): number;
}
interface IteratorConstructor {
  /** Yields each iterable in order. */
  concat<T>(...iterables: Iterable<T>[]): IteratorObject<T, undefined, unknown>;
}
interface SetConstructor {
  /** Groups items by the callback's key, retaining each group's original values. */
  groupBy<K, T>(items: Iterable<T>, keySelector: (item: T, index: number) => K): Map<K, T[]>;
}
`
const expected = `${JSON.stringify(Object.fromEntries(Object.entries(libraries).sort()), null, 2)}\n`
const file = Bun.file(
  new URL("../src/ui/editor/scriptTypeLibraries.json", import.meta.url),
)
if (Bun.argv.includes("--check")) {
  if (!(await file.exists()) || (await file.text()) !== expected)
    throw new Error(
      "Script type libraries are stale; run bun scripts/build-script-type-libraries.ts",
    )
} else await Bun.write(file, expected)
