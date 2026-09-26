import { expect, it } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { TreeSitterClient } from "@opentui/core"
import { codeEditorParsers } from "../../src/ui/editor/codeEditorParsers"

it("highlights JavaScript with the bundled parser and retains its assets in a standalone executable", async () => {
  const dir = await mkdtemp(join(tmpdir(), "noodle-script-parser-"))
  const client = new TreeSitterClient({ dataPath: join(dir, "cache") })
  try {
    client.addFiletypeParser(
      codeEditorParsers.find((parser) => parser.filetype === "javascript")!,
    )
    const parsed = await client.highlightOnce(
      'const value = "ok"; console.info(value)',
      "javascript",
    )
    expect(parsed.error).toBeUndefined()
    expect(parsed.highlights?.length).toBeGreaterThan(3)
    const entry = join(dir, "parser.ts")
    const binary = join(dir, "parser")
    await writeFile(
      entry,
      `import { codeEditorParsers } from ${JSON.stringify(new URL("../../src/ui/editor/codeEditorParsers.ts", import.meta.url).pathname)};
      const parser = codeEditorParsers.find(parser => parser.filetype === "javascript");
      const wasm = await Bun.file(parser.wasm).bytes();
      const query = await Bun.file(parser.queries.highlights[0]).text();
      if (wasm[0] !== 0 || wasm[1] !== 97 || !query.includes("function")) process.exit(1);
      console.log("bundled JavaScript assets loaded");`,
    )
    const build = Bun.spawn(
      [process.execPath, "build", "--compile", entry, "--outfile", binary],
      { stdout: "pipe", stderr: "pipe" },
    )
    expect(await build.exited).toBe(0)
    const run = Bun.spawn([binary], {
      cwd: dir,
      stdout: "pipe",
      stderr: "pipe",
    })
    expect(await run.exited).toBe(0)
    expect(await new Response(run.stdout).text()).toContain(
      "bundled JavaScript assets loaded",
    )
  } finally {
    await client.destroy()
    await rm(dir, { recursive: true, force: true })
  }
}, 30_000)
