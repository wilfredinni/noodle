import { copyFile, mkdir, readFile, rm } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { parseArgs } from "node:util"

const { values } = parseArgs({
  options: {
    "opentui-source": { type: "string" },
    zig: { type: "string", default: "zig" },
    cc: { type: "string", default: process.env.CC ?? "cc" },
    outfile: { type: "string", default: "noodle" },
    offline: { type: "boolean", default: false },
  },
})
if (!values["opentui-source"])
  throw new Error(
    "Usage: bun run build:homebrew --opentui-source <directory> [--zig <path>] [--cc <path>] [--outfile <path>] [--offline]",
  )
if (
  !["darwin", "linux"].includes(process.platform) ||
  !["arm64", "x64"].includes(process.arch)
)
  throw new Error(
    `Unsupported Homebrew build target: ${process.platform}-${process.arch}`,
  )
const root = resolve(import.meta.dir, "..")
const source = resolve(values["opentui-source"])
const outfile = resolve(root, values.outfile)
const run = async (command: string[], cwd = root, env = process.env) => {
  const child = Bun.spawn(command, {
    cwd,
    env,
    stdout: "inherit",
    stderr: "inherit",
  })
  if ((await child.exited) !== 0)
    throw new Error(`Build command failed: ${command.join(" ")}`)
}
const zigVersion = Bun.spawnSync([values.zig, "version"])
if (
  zigVersion.exitCode !== 0 ||
  zigVersion.stdout.toString().trim() !== "0.16.0"
)
  throw new Error("OpenTUI v0.5.14 requires Zig 0.16.0")
await run([
  process.execPath,
  "install",
  "--frozen-lockfile",
  "--ignore-scripts",
  ...(values.offline ? ["--offline"] : []),
])
const installed = await Bun.file(
  join(root, "node_modules/@opentui/core/package.json"),
).json()
const upstream = await Bun.file(
  join(source, "packages/core/package.json"),
).json()
if (upstream.version !== installed.version)
  throw new Error(
    `OpenTUI source ${upstream.version} does not match locked package ${installed.version}`,
  )
const nativeRoot = join(source, "packages/native")
await run(["sh", "scripts/prepare-zig-deps.sh"], nativeRoot)
await run([values.zig, "build", "-Doptimize=ReleaseFast"], nativeRoot)
const arch = process.arch === "arm64" ? "aarch64" : "x86_64"
const triple = `${arch}-${process.platform === "darwin" ? "macos" : "linux"}`
const library = `libopentui.${process.platform === "darwin" ? "dylib" : "so"}`
const packageDir = join(
  root,
  `node_modules/@opentui/core-${process.platform}-${process.arch}`,
)
const nativeLibrary = join(packageDir, library)
await rm(nativeLibrary, { force: true })
await copyFile(join(nativeRoot, "lib", triple, library), nativeLibrary)
await run(
  [
    process.execPath,
    "scripts/build-response-file-native.ts",
    "--host-compiler",
  ],
  root,
  { ...process.env, CC: values.cc },
)
await run([process.execPath, "run", "script:check"])
await run([process.execPath, "scripts/build-schema-validator.ts", "--check"])
await run([
  process.execPath,
  "scripts/build-script-type-libraries.ts",
  "--check",
])
await mkdir(dirname(outfile), { recursive: true })
const metafile = `${outfile}.metafile.json`
await run([
  process.execPath,
  "build",
  "--compile",
  "--entry-naming",
  "[name].[ext]",
  "--define",
  `process.platform=${JSON.stringify(process.platform)}`,
  "--define",
  `process.arch=${JSON.stringify(process.arch)}`,
  "--define",
  'process.env.OPENTUI_LIBC="glibc"',
  "--define",
  'process.env.NOODLE_LIBC="glibc"',
  `--metafile=${metafile}`,
  "src/app/cli.ts",
  "src/ui/editor/scriptDiagnostics.worker.ts",
  "--outfile",
  outfile,
])
const meta = JSON.parse(await readFile(metafile, "utf8"))
const embedded = new Set<string>()
for (const output of Object.values(meta.outputs) as {
  inputs: Record<string, { bytesInOutput: number }>
}[])
  for (const [input, info] of Object.entries(output.inputs))
    if (info.bytesInOutput > 0 && /\.(node|dylib|so|dll)$/.test(input))
      embedded.add(input)
const addon = `native/response-file/prebuilds/${process.platform}-${process.arch}.node`
if (
  embedded.size !== 2 ||
  ![...embedded].some((p) => p.endsWith(addon)) ||
  ![...embedded].some(
    (p) =>
      p.includes(`@opentui/core-${process.platform}-${process.arch}/`) &&
      p.endsWith(library),
  )
)
  throw new Error(
    `Expected only the two source-built native assets; embedded: ${[...embedded].join(", ")}`,
  )
await run([process.execPath, "scripts/sign-macos-binary.ts", outfile])
await run([process.execPath, "scripts/compiled-script-smoke.ts", outfile])
console.log(`Homebrew source build passed: ${outfile}`)
