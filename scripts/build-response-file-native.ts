import { createHash } from "node:crypto"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

const root = resolve(import.meta.dir, "../native/response-file")
const prebuilds = join(root, "prebuilds")
const targets: Record<string, string> = {
  "darwin-arm64": "aarch64-macos.13.0",
  "darwin-x64": "x86_64-macos.13.0",
  "linux-arm64": "aarch64-linux-gnu.2.17",
  "linux-x64": "x86_64-linux-gnu.2.17",
  "linux-arm64-musl": "aarch64-linux-musl",
  "linux-x64-musl": "x86_64-linux-musl",
  "win32-arm64": "aarch64-windows-gnu",
  "win32-x64": "x86_64-windows-gnu",
}
const sha256 = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex")
const source = createHash("sha256")
for (const name of [
  "response_file.c",
  "include/node_api.h",
  "include/node_api_types.h",
  "include/js_native_api.h",
  "include/js_native_api_types.h",
])
  source
    .update(name)
    .update("\0")
    .update(await readFile(join(root, name)))
const sourceHash = source.digest("hex")
const manifestPath = join(prebuilds, "manifest.json")
const args = process.argv.slice(2)
if (args.includes("--check")) {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
    sourceHash: string
    files: Record<string, string>
  }
  if (manifest.sourceHash !== sourceHash)
    throw new Error("Response native prebuilds have stale source metadata")
  for (const name of Object.keys(targets))
    if (
      manifest.files[`${name}.node`] !==
      sha256(await readFile(join(prebuilds, `${name}.node`)))
    )
      throw new Error(
        `Response native prebuild integrity check failed: ${name}`,
      )
  console.log("Response native source and eight prebuild hashes verified.")
  process.exit(0)
}

if (!args.includes("--manifest")) {
  let host = `${process.platform}-${process.arch}`
  if (process.platform === "linux") {
    const report = process.report.getReport() as {
      header?: { glibcVersionRuntime?: string }
    }
    if (!report.header?.glibcVersionRuntime) host += "-musl"
  }
  const requested = args.find((arg) => arg.startsWith("--target="))?.slice(9)
  const selected = args.includes("--all")
    ? Object.keys(targets)
    : [requested ?? host]
  const zig = process.env.NOODLE_ZIG ?? "zig"
  const version = Bun.spawnSync([zig, "version"])
  if (version.exitCode !== 0 || version.stdout.toString().trim() !== "0.15.2")
    throw new Error(
      "Native response builds require Zig 0.15.2 (maintainer build only)",
    )
  await mkdir(prebuilds, { recursive: true })
  const cache =
    process.env.NOODLE_NATIVE_BUILD_DIR ??
    join(tmpdir(), "noodle-response-native-build")
  await mkdir(cache, { recursive: true })
  for (const name of selected) {
    const target = targets[name]
    if (!target) throw new Error(`Unknown response native target: ${name}`)
    const flags = [
      "cc",
      "-target",
      target,
      "-std=c11",
      "-O2",
      "-Wall",
      "-Wextra",
      "-Werror",
      "-s",
      "-shared",
      `-I${join(root, "include")}`,
    ]
    if (name.startsWith("darwin")) flags.push("-Wl,-undefined,dynamic_lookup")
    else if (name.startsWith("linux")) flags.push("-fPIC")
    else {
      flags.push("-DBUILDING_NODE_EXTENSION")
      const arch = name.endsWith("arm64") ? "arm64" : "x64"
      const library = join(cache, `node-${arch}.lib`)
      // Official Node 22.14.0 import libraries, verified against SHASUMS256.txt.
      const expected =
        arch === "arm64"
          ? "988eb8c60a5ade17e652dbdb60d56d3c6ad5e599a99ce04932b8c4c86583cdaf"
          : "65e45757c026c93a170743a811ef1b921ae12d6d9dd62d258bbbca0626687626"
      let bytes = await readFile(library).catch(() => null)
      if (!bytes || sha256(bytes) !== expected) {
        const response = await fetch(
          `https://nodejs.org/dist/v22.14.0/win-${arch}/node.lib`,
        )
        if (!response.ok)
          throw new Error(
            `Unable to download Node-API import library: ${response.status}`,
          )
        bytes = Buffer.from(await response.arrayBuffer())
        if (sha256(bytes) !== expected)
          throw new Error("Node-API import library hash mismatch")
        await writeFile(library, bytes)
      }
      flags.push(library)
    }
    flags.push(
      join(root, "response_file.c"),
      "-o",
      join(prebuilds, `${name}.node`),
    )
    const child = Bun.spawn([zig, ...flags], {
      stdout: "inherit",
      stderr: "inherit",
      env: {
        ...process.env,
        ZIG_GLOBAL_CACHE_DIR: join(cache, "global"),
        ZIG_LOCAL_CACHE_DIR: join(cache, "local"),
      },
    })
    if ((await child.exited) !== 0)
      throw new Error(`Native response build failed: ${name}`)
    await rm(join(prebuilds, `${name}.pdb`), { force: true })
    await rm(join(prebuilds, "response_file.lib"), { force: true })
    console.log(`Built ${name}`)
  }
}
if (args.includes("--all") || args.includes("--manifest")) {
  const files: Record<string, string> = {}
  for (const name of Object.keys(targets))
    files[`${name}.node`] = sha256(
      await readFile(join(prebuilds, `${name}.node`)),
    )
  await writeFile(
    manifestPath,
    JSON.stringify(
      { nodeApiVersion: 8, zigVersion: "0.15.2", sourceHash, files },
      null,
      2,
    ) + "\n",
  )
}
