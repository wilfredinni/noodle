import { expect, it } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  SCRIPT_API_CONTRACT,
  SCRIPT_LIMITS,
  runRequestScript,
} from "../../src/preRequestScript"
import {
  generateScriptDeclarations,
  generateScriptReference,
} from "../../src/scriptApiTypes"
import { SCRIPT_IMPORT_GLOBALS } from "../../src/converters/scriptCompatibility"
import { scriptCompletions } from "../../src/ui/editor/scriptCompletion"
import { createScriptSemanticChecker } from "../../src/ui/editor/scriptSemanticChecker"
import { NOODLE_SKILL_FILES } from "../../src/agentSkill"
import { RunScope } from "../../src/runScope"
import { CollectionCookieJar } from "../../src/cookies"

it("keeps every contract member in runtime, completion metadata, types and the embedded reference", async () => {
  const reference = generateScriptReference()
  expect(
    await readFile(
      new URL(
        "../../.agents/skills/noodle-use/reference/script-api.md",
        import.meta.url,
      ),
      "utf8",
    ),
  ).toBe(reference)
  expect(
    await readFile(
      new URL(
        "../../.agents/skills/noodle-use/noodle-script.d.ts",
        import.meta.url,
      ),
      "utf8",
    ),
  ).toBe(generateScriptDeclarations())
  expect(NOODLE_SKILL_FILES["reference/script-api.md"]).toBe(reference)
  const checker = createScriptSemanticChecker(
    {
      pre: generateScriptDeclarations("pre"),
      post: generateScriptDeclarations("post"),
      tests: generateScriptDeclarations("tests"),
    },
    SCRIPT_LIMITS.sourceBytes,
  )
  const dir = await mkdtemp(join(tmpdir(), "noodle-contract-"))
  const jar = await CollectionCookieJar.open(dir, "contract")
  try {
    for (const phase of ["pre", "post", "tests"] as const) {
      const entries = SCRIPT_API_CONTRACT.filter((entry) =>
        entry.phases.includes(phase),
      )
      const expressions = entries.map((entry) =>
        entry.global === "expect" && entry.member
          ? `expect(1).${entry.member}`
          : entry.member
            ? `${entry.global}.${entry.member}`
            : entry.global,
      )
      const source = entries
        .map((entry, index) => {
          const path = entry.member
            ? `${entry.global}.${entry.member}`
            : entry.global
          expect(reference).toContain(`| \`${path}\` |`)
          expect(reference).toContain(entry.description)
          const parent = entry.member.split(".").slice(0, -1).join(".")
          const query =
            entry.global === "expect" && entry.member
              ? "expect(1)."
              : entry.member
                ? `${entry.global}.${parent ? `${parent}.` : ""}`
                : entry.global.slice(0, -1)
          const completion = scriptCompletions(
            query,
            query.length,
            phase,
          )?.items.find((item) => item.key === path)
          expect(completion?.description).toBe(
            `${entry.signature} · ${entry.description}`,
          )
          const semantic = checker
            .assist(
              query,
              phase,
              query.length,
              { environmentKeys: [], requestIds: [] },
              true,
            )
            .items.find(
              (item) =>
                item.label === (entry.member.split(".").at(-1) || entry.global),
            )
          expect(semantic).toBeDefined()
          expect(
            checker.details(query, phase, query.length, semantic!.key)
              .description,
          ).toContain(entry.description)
          return `if (typeof ${expressions[index]} ${entry.kind === "method" || entry.global === "test" || (entry.global === "expect" && !entry.member) ? '!== "function"' : '=== "undefined"'}) throw Error(${JSON.stringify(path)});`
        })
        .join("\n")
      expect(
        checker.check(
          expressions
            .map((expression, index) => `const member${index} = ${expression};`)
            .join("\n"),
          phase,
        ),
      ).toEqual({ count: 0 })
      const result = await runRequestScript(
        phase,
        source,
        {
          id: "contract",
          name: "Contract",
          method: "GET",
          url: "http://127.0.0.1/",
          headers: {},
          params: [],
          timeout: 0,
        },
        undefined,
        new RunScope(),
        {
          cookies: jar,
          response: {
            status: 200,
            statusText: "OK",
            timeMs: 1,
            headers: {},
            body: "{}",
          },
        },
      )
      expect(result.result.error).toBeUndefined()
      expect(result.result.success).toBe(true)
    }
  } finally {
    checker.dispose()
    await jar.close()
    await rm(dir, { recursive: true, force: true })
  }
})

it("keeps host capabilities, environment enumeration and implicit prompts absent in all phases", async () => {
  const forbidden = [
    "Bun",
    "process",
    "Deno",
    "require",
    "module",
    "exports",
    "fetch",
    "XMLHttpRequest",
    "WebSocket",
    "Worker",
    "setTimeout",
    "setInterval",
    "setImmediate",
    "queueMicrotask",
    "readFile",
    "writeFile",
    "spawn",
    "exec",
    "prompt",
    "confirm",
    "alert",
    "localStorage",
    "navigator",
  ]
  const source = `for (const name of ${JSON.stringify(forbidden)}) if (typeof globalThis[name] !== "undefined") throw Error(name);
    if (Object.keys(noodle.env).join() !== "get") throw Error("environment enumeration or mutation");
    for (const name of ${JSON.stringify(SCRIPT_IMPORT_GLOBALS.filter((name) => name !== "undefined"))}) if (typeof globalThis[name] === "undefined") throw Error("unsupported import global: " + name);`
  for (const phase of ["pre", "post", "tests"] as const) {
    const result = await runRequestScript(
      phase,
      source,
      {
        id: "negative",
        name: "Negative",
        method: "GET",
        url: "http://127.0.0.1/",
        headers: {},
        params: [],
        timeout: 0,
      },
      undefined,
      new RunScope(),
      {
        response: {
          status: 200,
          statusText: "OK",
          timeMs: 1,
          headers: {},
          body: "{}",
        },
      },
    )
    expect(result.result.error).toBeUndefined()
    expect(result.result.success).toBe(true)
  }
})
