import { expect, it } from "bun:test"
import { cp, copyFile, mkdir, mkdtemp, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { releaseTargets } from "../../scripts/release-artifacts"

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

it.each(releaseTargets)(
  "bundles only the supported addon for $target",
  async ({ target }) => {
    const [platform, arch] = target.split("-")
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
        `process.platform=${JSON.stringify(platform)}`,
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
      expect(addons).toEqual([`native/response-file/prebuilds/${target}.node`])
    } finally {
      await rm(work, { recursive: true, force: true })
    }
  },
)

const retiredTargets = ["win32-arm64", "linux-arm64-musl", "linux-x64-musl"]

it.each(retiredTargets)(
  "rejects building unsupported target %s before invoking a compiler",
  (target) => {
    const result = Bun.spawnSync(
      [
        process.execPath,
        "scripts/build-response-file-native.ts",
        `--target=${target}`,
      ],
      { env: { ...process.env, NOODLE_ZIG: "no-such-noodle-test-compiler" } },
    )
    expect(result.exitCode).not.toBe(0)
    expect(result.stderr.toString()).toContain(
      `Unknown response native target: ${target}`,
    )
  },
)

it.each([...retiredTargets, "darwin-ia32"])(
  "rejects loading an addon on unsupported %s",
  (target) => {
    const [platform, arch] = target.split("-")
    const result = Bun.spawnSync([
      process.execPath,
      "-e",
      `Object.defineProperty(process, "platform", { value: ${JSON.stringify(platform)} });
     Object.defineProperty(process, "arch", { value: ${JSON.stringify(arch)} });
     process.report.getReport = () => ({ header: {} });
     delete process.env.NOODLE_LIBC;
     const { responseFileNative } = await import("./src/responseFileNative.ts");
     responseFileNative();`,
    ])
    expect(result.exitCode).not.toBe(0)
    expect(result.stderr.toString()).toContain(
      `Unsupported response file platform: ${target}`,
    )
    expect(result.stderr.toString()).not.toContain("Cannot find module")
  },
)

it("keeps the native manifest and files aligned with the five release targets", async () => {
  const directory = resolve(
    import.meta.dir,
    "../../native/response-file/prebuilds",
  )
  const expected = releaseTargets.map(({ target }) => `${target}.node`).sort()
  const manifest = await Bun.file(join(directory, "manifest.json")).json()
  expect(Object.keys(manifest.files).sort()).toEqual(expected)
  expect(
    (await readdir(directory)).filter((name) => name.endsWith(".node")).sort(),
  ).toEqual(expected)
})

it("--all builds and hashes exactly the supported release targets", async () => {
  const root = resolve(import.meta.dir, "../..")
  const work = await mkdtemp(join(tmpdir(), "noodle-native-targets-"))
  try {
    await mkdir(join(work, "scripts"))
    await copyFile(
      join(root, "scripts/build-response-file-native.ts"),
      join(work, "scripts/build-response-file-native.ts"),
    )
    await cp(join(root, "native"), join(work, "native"), { recursive: true })
    await rm(join(work, "native/response-file/prebuilds"), { recursive: true })
    const result = Bun.spawnSync(
      [
        process.execPath,
        "-e",
        `import { writeFileSync } from "node:fs";
       process.argv = ["bun", "script", "--all"];
       Bun.spawnSync = () => ({ exitCode: 0, stdout: Buffer.from("0.15.2") });
       Bun.spawn = (command) => {
         writeFileSync(command.at(-1), "fixture-native-addon");
         return { exited: Promise.resolve(0) };
       };
       await import("./scripts/build-response-file-native.ts");`,
      ],
      { cwd: work },
    )
    expect({
      code: result.exitCode,
      error: result.stderr.toString(),
    }).toMatchObject({ code: 0 })
    const manifest = await Bun.file(
      join(work, "native/response-file/prebuilds/manifest.json"),
    ).json()
    expect(Object.keys(manifest.files).sort()).toEqual(
      releaseTargets.map(({ target }) => `${target}.node`).sort(),
    )
    const check = Bun.spawnSync(
      [process.execPath, "scripts/build-response-file-native.ts", "--check"],
      { cwd: work },
    )
    expect(check.exitCode).toBe(0)
    expect(check.stdout.toString()).toContain("five prebuild hashes verified")
  } finally {
    await rm(work, { recursive: true, force: true })
  }
})
