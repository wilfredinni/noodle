// Rebuild the Bun dependency patch with QuickJS's native rejection tracker.
// Requires Git, Docker, and Bun. Normal installs/builds use the committed patch.
// Upstream v0.32.0 and its Emscripten 5.0.1 compiler are pinned below.
import {
  copyFile,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const revision = "df4efb9ef2cb25c417ecb57986da462d11b244ed"
const compiler =
  "emscripten/emsdk@sha256:c89732ef63a56de5a96395c5a8c1c7904f7420131a045406e6fedc4cbe1cc198"
const packageName = "@jitl/quickjs-singlefile-mjs-release-sync"
const source = await mkdtemp(join(tmpdir(), "noodle-quickjs-"))

function run(cmd: string[], cwd = root): string {
  const result = Bun.spawnSync(cmd, { cwd, stdout: "pipe", stderr: "pipe" })
  if (result.exitCode !== 0)
    throw new Error(
      `${cmd[0]} failed (${result.exitCode}):\n${result.stdout}\n${result.stderr}`,
    )
  return result.stdout.toString().trim()
}

try {
  run([
    "git",
    "clone",
    "--depth",
    "1",
    "--branch",
    "v0.32.0",
    "https://github.com/justjake/quickjs-emscripten.git",
    source,
  ])
  if (run(["git", "rev-parse", "HEAD"], source) !== revision)
    throw new Error("QuickJS source revision does not match the pinned version")
  run(
    ["git", "apply", join(root, "patches/quickjs-rejections.c.patch")],
    source,
  )

  const variant = "packages/variant-quickjs-singlefile-mjs-release-sync"
  const build = join(source, variant, "build/wrapper")
  await mkdir(build, { recursive: true })
  const code = await readFile(join(source, "c/interface.c"), "utf8")
  // Same public C declarations used by upstream's symbols generator.
  const exports = [
    ...code.matchAll(/^([\w()* ]+[\s*]+)(QTS_\w+)\((.*?)\) ?\{/gm),
  ]
    .filter((match) => !match[1]!.includes("AsyncifyOnly"))
    .map((match) => `_${match[2]}`)
  await writeFile(
    join(build, "symbols.json"),
    JSON.stringify([...exports, "_malloc", "_free"]),
  )
  await writeFile(join(build, "asyncify-remove.json"), "[]")
  await writeFile(join(build, "asyncify-imports.json"), "[]")
  run([
    "docker",
    "run",
    "--rm",
    "--network",
    "none",
    "--mount",
    `type=bind,source=${source},target=/src`,
    "--workdir",
    `/src/${variant}`,
    compiler,
    "make",
    "-j2",
    "EMCC=emcc",
  ])

  run(["bun", "patch", `${packageName}@0.32.0`])
  const installed = join(root, "node_modules", packageName)
  // Bun cache tags are machine-local bookkeeping, not part of the package.
  for (const entry of await readdir(installed)) {
    if (entry.startsWith(".bun-tag-")) await rm(join(installed, entry))
  }
  await copyFile(
    join(source, variant, "dist/emscripten-module.mjs"),
    join(installed, "dist/emscripten-module.noodle.mjs"),
  )
  const index = join(installed, "dist/index.mjs")
  await writeFile(
    index,
    (await readFile(index, "utf8"))
      .replace(/emscripten-module-[\w]+\.mjs/g, "emscripten-module.noodle.mjs")
      .replace(/\/\/# sourceMappingURL=.*\n?/g, ""),
  )
  run(["bun", "patch", "--commit", installed])
  const patch = join(
    root,
    "patches/@jitl%2Fquickjs-singlefile-mjs-release-sync@0.32.0.patch",
  )
  await writeFile(
    patch,
    (await readFile(patch, "utf8")).replaceAll(`a${installed}/`, "a/"),
  )
  run(["bun", "install", "--offline", "--ignore-scripts"])
  console.log("Rebuilt QuickJS rejection-tracking patch")
} finally {
  await rm(source, { recursive: true, force: true })
}
