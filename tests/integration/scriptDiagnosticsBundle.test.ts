import { expect, it } from "bun:test"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

it("runs semantic diagnostics and bundled workers from an empty standalone directory", async () => {
  const dir = await mkdtemp(join(tmpdir(), "noodle-script-diagnostics-"))
  try {
    const entry = join(dir, "check.ts")
    const suppliedBinary = process.env.NOODLE_TEST_BINARY
    const binary = suppliedBinary
      ? resolve(suppliedBinary)
      : join(dir, process.platform === "win32" ? "check.exe" : "check")
    const module = fileURLToPath(
      new URL("../../src/ui/editor/scriptDiagnosticsSmoke.ts", import.meta.url),
    )
    const worker = fileURLToPath(
      new URL(
        "../../src/ui/editor/scriptDiagnostics.worker.ts",
        import.meta.url,
      ),
    )
    await writeFile(
      entry,
      `import { verifyBundledScriptDiagnostics } from ${JSON.stringify(module)};
await verifyBundledScriptDiagnostics();
console.log('bundled semantic diagnostics passed');`,
    )
    if (!suppliedBinary) {
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
      const [buildCode, buildOutput, errors] = await Promise.all([
        build.exited,
        new Response(build.stdout).text(),
        new Response(build.stderr).text(),
      ])
      expect({ buildCode, buildOutput, errors }).toMatchObject({ buildCode: 0 })
      const sign = Bun.spawn(
        [
          process.execPath,
          fileURLToPath(
            new URL("../../scripts/sign-macos-binary.ts", import.meta.url),
          ),
          binary,
        ],
        { stdout: "pipe", stderr: "pipe" },
      )
      const [signCode, signOutput, signError] = await Promise.all([
        sign.exited,
        new Response(sign.stdout).text(),
        new Response(sign.stderr).text(),
      ])
      expect({ signCode, signOutput, signError }).toMatchObject({ signCode: 0 })
    }
    await mkdir(join(dir, "empty"))
    const run = Bun.spawn([binary], {
      cwd: join(dir, "empty"),
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        NODE_PATH: "",
        NOODLE_TEST_SCRIPT_DIAGNOSTICS: suppliedBinary ? "1" : "",
      },
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
