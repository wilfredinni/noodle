import { expect, it } from "bun:test"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

it("runs semantic diagnostics and bundled workers from an empty standalone directory", async () => {
  const dir = await mkdtemp(join(tmpdir(), "noodle-script-diagnostics-"))
  try {
    const entry = join(dir, "check.ts")
    const binary = join(dir, "check")
    const module = fileURLToPath(
      new URL("../../src/ui/editor/scriptDiagnostics.ts", import.meta.url),
    )
    const worker = fileURLToPath(
      new URL(
        "../../src/ui/editor/scriptDiagnostics.worker.ts",
        import.meta.url,
      ),
    )
    await writeFile(
      entry,
      `import { createScriptDiagnostics } from ${JSON.stringify(module)};
const checker = createScriptDiagnostics();
try {
  const invalid = await checker.check('noodle.request.headers.set(42, "x")', 'pre');
  if (!invalid.first?.message.includes('not assignable')) throw new Error(JSON.stringify(invalid));
  const valid = await checker.check('const child = await noodle.runRequest("child"); console.log(child.json().id)', 'pre');
  if (valid.count) throw new Error(JSON.stringify(valid));
  console.log('bundled semantic diagnostics passed');
} finally { checker.dispose(); }`,
    )
    const build = Bun.spawn(
      [
        process.execPath,
        "build",
        "--compile",
        "--entry-naming",
        "[name].[ext]",
        entry,
        worker,
        "--outfile",
        binary,
      ],
      { cwd: dir, stdout: "pipe", stderr: "pipe" },
    )
    const [buildCode, errors] = await Promise.all([
      build.exited,
      new Response(build.stderr).text(),
    ])
    expect({ buildCode, errors }).toMatchObject({ buildCode: 0 })
    await mkdir(join(dir, "empty"))
    const run = Bun.spawn([binary], {
      cwd: join(dir, "empty"),
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, NODE_PATH: "" },
    })
    const [code, output, error] = await Promise.all([
      run.exited,
      new Response(run.stdout).text(),
      new Response(run.stderr).text(),
    ])
    expect({ code, output, error }).toEqual({
      code: 0,
      output: "bundled semantic diagnostics passed\n",
      error: "",
    })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}, 30_000)
