import { expect, it } from "bun:test"
import { cp, copyFile, mkdir, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

it("builds the Homebrew glibc addon when the Linux runtime report lacks libc", async () => {
  const root = resolve(import.meta.dir, "../..")
  const work = await mkdtemp(join(tmpdir(), "noodle-host-compiler-"))
  try {
    await mkdir(join(work, "scripts"))
    await copyFile(
      join(root, "scripts/build-response-file-native.ts"),
      join(work, "scripts/build-response-file-native.ts"),
    )
    await cp(join(root, "native"), join(work, "native"), { recursive: true })
    const result = Bun.spawnSync(
      [
        process.execPath,
        "-e",
        `import { writeFileSync } from "node:fs";
         Object.defineProperty(process, "platform", { value: "linux" });
         process.report.getReport = () => ({ header: {} });
         process.argv = ["bun", "script", "--host-compiler"];
         Bun.spawn = (command) => {
           writeFileSync("compiler.json", JSON.stringify(command));
           return { exited: Promise.resolve(0) };
         };
         await import("./scripts/build-response-file-native.ts");`,
      ],
      { cwd: work, env: { ...process.env, CC: "homebrew-test-cc" } },
    )
    expect(result.exitCode).toBe(0)
    const command = await Bun.file(join(work, "compiler.json")).json()
    expect(command[0]).toBe("homebrew-test-cc")
    expect(command.at(-1).replaceAll("\\", "/")).toEndWith(
      `/linux-${process.arch}.node`,
    )
  } finally {
    await rm(work, { recursive: true, force: true })
  }
})

it.each(["arm64", "x64"])(
  "bundles only the source-built glibc addon for Homebrew Linux %s",
  async (arch) => {
    const root = resolve(import.meta.dir, "../..")
    const work = await mkdtemp(join(tmpdir(), "noodle-glibc-bundle-"))
    try {
      const metafile = join(work, "bundle.json")
      const result = Bun.spawnSync([
        process.execPath,
        "build",
        join(root, "src/responseFileNative.ts"),
        "--target=bun",
        "--define",
        'process.platform="linux"',
        "--define",
        `process.arch=${JSON.stringify(arch)}`,
        "--define",
        'process.env.NOODLE_LIBC="glibc"',
        `--metafile=${metafile}`,
        "--outdir",
        work,
      ])
      expect({
        exitCode: result.exitCode,
        stderr: result.stderr.toString(),
      }).toMatchObject({ exitCode: 0 })
      const meta = await Bun.file(metafile).json()
      const addons = Object.keys(meta.inputs).filter((path) =>
        path.endsWith(".node"),
      )
      expect(addons).toEqual([
        `native/response-file/prebuilds/linux-${arch}.node`,
      ])
    } finally {
      await rm(work, { recursive: true, force: true })
    }
  },
)
