import { createHash } from "node:crypto"
import { chmod, readFile } from "node:fs/promises"
import { basename, dirname, resolve } from "node:path"

const input = process.argv[2]
if (!input) throw new Error("Usage: validate-release-artifact.ts <binary>")

const binary = resolve(input)
const name = basename(binary)
const sums = await readFile(resolve(dirname(binary), "SHA256SUMS"), "utf8")
const entry = sums
  .split(/\r?\n/)
  .map((line) => line.match(/^([a-fA-F0-9]{64})\s+\*?(.+)$/))
  .find((match) => match?.[2] === name)
if (!entry) throw new Error(`Missing or invalid release checksum for ${name}`)

const actual = createHash("sha256")
  .update(await readFile(binary))
  .digest("hex")
if (actual !== entry[1]!.toLowerCase())
  throw new Error(`Downloaded release checksum mismatch for ${name}`)

if (process.platform === "darwin") {
  const signature = Bun.spawnSync([
    "/usr/bin/codesign",
    "--verify",
    "--strict",
    "--verbose=2",
    binary,
  ])
  if (signature.exitCode !== 0) {
    process.stderr.write(signature.stderr)
    throw new Error(`Downloaded macOS release signature is invalid: ${name}`)
  }
}

if (process.platform !== "win32") await chmod(binary, 0o755)

const expectedVersion = (await Bun.file(
  resolve(import.meta.dir, "../package.json"),
).json()) as { version: string }
const version = Bun.spawnSync([binary, "--version"])
if (version.exitCode !== 0) {
  process.stderr.write(version.stderr)
  throw new Error(`Downloaded release binary did not start: ${name}`)
}
const actualVersion = version.stdout.toString().trim()
if (actualVersion !== expectedVersion.version)
  throw new Error(
    `Downloaded binary reported ${actualVersion}, expected ${expectedVersion.version}`,
  )

const smoke = Bun.spawnSync([
  process.execPath,
  resolve(import.meta.dir, "compiled-script-smoke.ts"),
  binary,
])
process.stdout.write(smoke.stdout)
process.stderr.write(smoke.stderr)
if (smoke.exitCode !== 0)
  throw new Error(`Downloaded release scripting smoke failed: ${name}`)
