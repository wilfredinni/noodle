import { afterEach, describe, expect, it, spyOn } from "bun:test"
import {
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import {
  validateScriptSyntax,
  SCRIPT_API_CONTRACT,
} from "../../src/preRequestScript"
import { createScriptSourceResolver } from "../../src/scriptSourceResolver"
import { generateScriptDeclarations } from "../../src/scriptApiTypes"
import { withScript } from "../../src/scriptAuthoring"
import { scriptCompletions } from "../../src/ui/editor/scriptCompletion"
import { javascriptTokens } from "../../src/ui/editor/javascriptSyntax"
import { codeEditorParsers } from "../../src/ui/editor/codeEditorParsers"
import { executeRequestLifecycle } from "../../src/requestLifecycle"
import { RunScope } from "../../src/runScope"
import { executor } from "../../src/requests"
import { lang } from "../../src/lang"
import type { Request } from "../../src/schema"

const request: Request = {
  id: "script",
  name: "Script",
  method: "GET",
  url: "https://example.com",
  headers: {},
  params: [],
  timeout: 0,
}
const origin = {
  scope: "request" as const,
  scopeId: "script",
  path: "script.yml",
}
const directories: string[] = []
afterEach(async () => {
  for (const dir of directories.splice(0))
    await rm(dir, { recursive: true, force: true })
})

function completions(value: string, phase: "pre" | "post" | "tests" = "pre") {
  return scriptCompletions(value, value.length, phase)?.items ?? []
}

describe("script authoring contract", () => {
  it("serializes all phases through request YAML and removes empty declarations", () => {
    let draft = withScript(request, "pre", 'console.info("before")\n')
    draft = withScript(draft, "post", "./scripts/after.js")
    draft = withScript(draft, "tests", 'test("ok", () => expect(1).toBe(1))')
    const restored = lang.parseRequest(request.id, lang.serializeRequest(draft))
    expect(restored.scripts).toEqual(draft.scripts)
    expect(restored.tests).toBe(draft.tests)
    draft = withScript(
      withScript(withScript(draft, "pre", ""), "post", ""),
      "tests",
      "",
    )
    expect(lang.serializeRequest(draft)).not.toContain("scripts:")
    expect(lang.serializeRequest(draft)).not.toContain("tests:")
  })

  it("compiles without executing code or requiring runtime APIs and reports source lines", async () => {
    expect(
      await validateScriptSyntax(
        'while (true) {}\nawait fetch("https://example.com"); process.exit(1)',
      ),
    ).toBeNull()
    const invalid = await validateScriptSyntax("const x = 1\nconst broken = ;")
    expect(invalid?.name).toBe("SyntaxError")
    expect(invalid?.line).toBe(2)
    expect(invalid?.column).toBeGreaterThan(0)
    expect(
      await validateScriptSyntax('await noodle.runRequest("child")'),
    ).toBeNull()
  })

  it("derives phase-aware global, member and matcher completions from the runtime contract", () => {
    expect(completions("resp")).toEqual([])
    expect(completions("resp", "post").map((x) => x.label)).toContain(
      "noodle.response",
    )
    expect(completions("tes").map((x) => x.label)).not.toContain("test")
    expect(completions("tes", "tests").map((x) => x.label)).toContain("test")
    expect(
      completions("noodle.request.headers.").map((x) => x.label),
    ).toContain("set")
    expect(
      completions("noodle.request.headers.", "post").map((x) => x.label),
    ).not.toContain("set")
    expect(
      completions("noodle.run.", "tests").map((x) => x.label),
    ).not.toContain("set")
    expect(completions("noodle.cookies.", "tests").map((x) => x.label)).toEqual(
      ["get"],
    )
    expect(completions("noodle.env.").map((x) => x.label)).toEqual(["get"])
    expect(
      completions("expect(1).not.", "tests").map((x) => x.label),
    ).toContain("toBe")
    expect(completions("noodle.random.").length).toBeGreaterThan(20)
    expect(completions("noodle.time.").length).toBeGreaterThan(3)
    const item = completions("noodle.run.set").length
    expect(item).toBe(0)
    const descriptor = SCRIPT_API_CONTRACT.find((x) => x.member === "run.set")!
    expect(completions("noodle.run.se")[0]?.description).toBe(
      `${descriptor.signature} · ${descriptor.description}`,
    )
    for (const value of [
      "// noodle.run.",
      '"noodle.run.',
      "/* noodle.run.",
      "`noodle.run.",
    ])
      expect(completions(value)).toEqual([])
  })

  it("ships generated declarations and bundled JavaScript parser assets with fallback tokens", async () => {
    expect(
      await readFile(
        new URL(
          "../../.agents/skills/noodle-use/noodle-script.d.ts",
          import.meta.url,
        ),
        "utf8",
      ),
    ).toBe(generateScriptDeclarations())
    const parser = codeEditorParsers.find((x) => x.filetype === "javascript")!
    expect(
      (await Bun.file(parser.wasm).arrayBuffer()).byteLength,
    ).toBeGreaterThan(1000)
    expect(await Bun.file(parser.queries!.highlights![0]!).text()).toContain(
      "function",
    )
    expect(
      javascriptTokens(
        'const message = "hello"; // comment\nawait noodle.runRequest("child"); 42',
      ).map((x) => x.kind),
    ).toEqual(["keyword", "string", "comment", "keyword", "string", "number"])
  })

  it("validates the execution snapshot and opens only canonical files inside the collection", async () => {
    const dir = await mkdtemp(join(tmpdir(), "noodle-authoring-"))
    directories.push(dir)
    await writeFile(join(dir, "valid.js"), 'console.log("first")')
    await writeFile(join(dir, "invalid.js"), "const broken = ;")
    await symlink("valid.js", join(dir, "alias.js"))
    const resolver = createScriptSourceResolver(dir, true)
    expect(await resolver.resolveFile("./alias.js", origin)).toBe(
      await realpath(join(dir, "valid.js")),
    )
    await resolver.resolveBlocks([
      { source: origin, scripts: { post: "./valid.js" } },
    ])
    await writeFile(join(dir, "valid.js"), "invalid(")
    expect((await resolver.resolve("./valid.js", origin)).text).toBe(
      'console.log("first")',
    )
    await expect(
      createScriptSourceResolver(dir, true).resolveBlocks([
        { source: origin, tests: "./valid.js" },
      ]),
    ).rejects.toThrow("SyntaxError")
    await expect(
      resolver.resolveBlocks([{ source: origin, tests: "./invalid.js" }]),
    ).rejects.toThrow("1:")
    await symlink("/etc/passwd", join(dir, "outside.js"))
    await expect(resolver.resolveFile("./outside.js", origin)).rejects.toThrow(
      "outside the collection root",
    )
    await expect(resolver.resolveFile("./missing.js", origin)).rejects.toThrow(
      "invalid, missing, or unreadable",
    )
  })

  it("TUI preflight blocks post and test syntax before HTTP while default lifecycle stays authoritative", async () => {
    const send = spyOn(executor, "send").mockResolvedValue({
      status: 200,
      statusText: "OK",
      headers: {},
      body: "{}",
      timeMs: 1,
    })
    try {
      for (const phase of ["pre", "post", "tests"] as const) {
        const result = await executeRequestLifecycle({
          request: withScript(request, phase, "const broken = ;"),
          runScope: new RunScope(),
          scriptSources: createScriptSourceResolver(undefined, true),
        })
        expect(result.status).toBe("error")
        if (result.status === "error")
          expect(result.failureCategory).toBe("configuration")
      }
      expect(send).not.toHaveBeenCalled()
      const ordinary = await executeRequestLifecycle({
        request: withScript(request, "post", "const broken = ;"),
        runScope: new RunScope(),
      })
      expect(ordinary.status).toBe("done")
      expect(send).toHaveBeenCalledTimes(1)
      const logged = await executeRequestLifecycle({
        consoleTiming: true,
        request: withScript(request, "pre", 'console.info("ready")'),
        runScope: new RunScope(),
        scriptSources: createScriptSourceResolver(undefined, true),
      })
      expect(
        logged.execution.scripts?.results[0]?.logs[0]?.timeMs,
      ).toBeGreaterThanOrEqual(0)
    } finally {
      send.mockRestore()
    }
  })
})
