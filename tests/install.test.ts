import { describe, expect, it } from "bun:test"
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

const INSTALL_SCRIPT = join(import.meta.dir, "../scripts/install.sh")
const BINARY = "noodle release binary\n"
const BINARY_SHA256 =
  "e81696c732412c4e61ee52e9c13b40412292cf43965a8c566fd8e8699991a5b8"
const ASSET_NAME = `noodle-${process.platform === "darwin" ? "macos" : "linux"}-${process.arch === "arm64" ? "arm64" : "x86_64"}`

async function writeFakeCurl(
  directory: string,
  checksum: string,
): Promise<void> {
  const path = join(directory, "curl")
  await writeFile(
    path,
    `#!/usr/bin/env bash
set -eu
output=""
url="$*"
while [ "$#" -gt 0 ]; do
  if [ "$1" = "-o" ]; then
    output="$2"
    shift 2
  else
    shift
  fi
done
case "$url" in
  *SHA256SUMS*) printf '%s  ${ASSET_NAME}\\n' '${checksum}' > "$output" ;;
  *) printf '%s' '${BINARY}' > "$output" ;;
esac
`,
  )
  await chmod(path, 0o755)
}

async function runInstaller(
  installDir: string,
  binDir: string,
): Promise<ReturnType<typeof Bun.spawnSync>> {
  return Bun.spawnSync(["/bin/bash", INSTALL_SCRIPT], {
    env: {
      ...process.env,
      NOODLE_INSTALL_DIR: installDir,
      NOODLE_VERSION: "v0.4.7",
      PATH: `${binDir}:${process.env.PATH}`,
    },
  })
}

describe("install script", () => {
  it("installs a binary only after its release checksum verifies", async () => {
    const directory = await mkdtemp(join(tmpdir(), "noodle-install-"))
    const binDir = join(directory, "bin")
    const installDir = join(directory, "install")
    try {
      await mkdir(binDir, { recursive: true })
      await writeFakeCurl(binDir, BINARY_SHA256)

      const result = await runInstaller(installDir, binDir)

      expect(result.exitCode).toBe(0)
      expect(await readFile(join(installDir, "noodle"), "utf8")).toBe(BINARY)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it("preserves an existing installation when checksum verification fails", async () => {
    const directory = await mkdtemp(join(tmpdir(), "noodle-install-"))
    const binDir = join(directory, "bin")
    const installDir = join(directory, "install")
    try {
      await Promise.all([
        mkdir(binDir, { recursive: true }),
        mkdir(installDir, { recursive: true }),
      ])
      await writeFile(join(installDir, "noodle"), "old binary")
      await writeFakeCurl(binDir, "0".repeat(64))

      const result = await runInstaller(installDir, binDir)

      expect(result.exitCode).not.toBe(0)
      expect(await readFile(join(installDir, "noodle"), "utf8")).toBe(
        "old binary",
      )
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
