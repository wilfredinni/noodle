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
import { createHash } from "node:crypto"

const INSTALL_SCRIPT = join(import.meta.dir, "../scripts/install.sh")
const BINARY = "noodle release binary\n"
const BINARY_SHA256 =
  "e81696c732412c4e61ee52e9c13b40412292cf43965a8c566fd8e8699991a5b8"
const ASSET_NAME = `noodle-${process.platform === "darwin" ? "macos" : "linux"}-${process.arch === "arm64" ? "arm64" : "x86_64"}`

async function writeFakeCurl(
  directory: string,
  checksum: string,
  binary = BINARY,
): Promise<void> {
  const path = join(directory, "curl")
  const release = join(directory, "release-binary")
  await writeFile(release, binary)
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
  *) /bin/cp '${release}' "$output" ;;
esac
`,
  )
  await chmod(path, 0o755)
}

async function writeFailingCurl(directory: string): Promise<void> {
  const path = join(directory, "curl")
  await writeFile(
    path,
    `#!/usr/bin/env bash
echo "simulated download failure" >&2
exit 1
`,
  )
  await chmod(path, 0o755)
}

async function writeStrictRm(directory: string): Promise<void> {
  const path = join(directory, "rm")
  await writeFile(
    path,
    `#!/usr/bin/env bash
for path in "$@"; do
  if [ -z "$path" ]; then
    echo "rm: empty path" >&2
    exit 1
  fi
done
exec /bin/rm "$@"
`,
  )
  await chmod(path, 0o755)
}

async function runInstaller(
  installDir: string,
  binDir: string,
  home: string,
): Promise<ReturnType<typeof Bun.spawnSync>> {
  return Bun.spawnSync(["/bin/bash", INSTALL_SCRIPT], {
    env: {
      ...process.env,
      NOODLE_INSTALL_DIR: installDir,
      NOODLE_VERSION: "v0.4.7",
      HOME: home,
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

      const result = await runInstaller(
        installDir,
        binDir,
        join(directory, "home"),
      )

      expect(result.exitCode).toBe(0)
      expect(await readFile(join(installDir, "noodle"), "utf8")).toBe(BINARY)
      expect(new TextDecoder().decode(result.stdout)).not.toContain(
        "Updated Noodle skill",
      )
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

      const result = await runInstaller(
        installDir,
        binDir,
        join(directory, "home"),
      )

      expect(result.exitCode).not.toBe(0)
      expect(await readFile(join(installDir, "noodle"), "utf8")).toBe(
        "old binary",
      )
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it("does not pass an empty staged path to cleanup after download failure", async () => {
    const directory = await mkdtemp(join(tmpdir(), "noodle-install-"))
    const binDir = join(directory, "bin")
    const installDir = join(directory, "install")
    try {
      await mkdir(binDir, { recursive: true })
      await Promise.all([writeFailingCurl(binDir), writeStrictRm(binDir)])

      const result = await runInstaller(
        installDir,
        binDir,
        join(directory, "home"),
      )

      expect(result.exitCode).not.toBe(0)
      expect(new TextDecoder().decode(result.stderr)).not.toContain(
        "rm: empty path",
      )
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it("refreshes a pre-existing skill with the newly installed binary", async () => {
    const directory = await mkdtemp(join(tmpdir(), "noodle-install-skill-"))
    const binDir = join(directory, "bin")
    const installDir = join(directory, "install")
    const home = join(directory, "home")
    const binary = `#!/usr/bin/env bash
printf '%s' "$*" > "$HOME/skill-refresh"
`
    try {
      await mkdir(join(home, ".agents", "skills", "noodle-use"), {
        recursive: true,
      })
      await mkdir(binDir, { recursive: true })
      const hash = createHash("sha256").update(binary).digest("hex")
      await writeFakeCurl(binDir, hash, binary)

      const result = await runInstaller(installDir, binDir, home)

      expect(result.exitCode).toBe(0)
      expect(await readFile(join(home, "skill-refresh"), "utf8")).toBe(
        "agent install --json",
      )
      expect(new TextDecoder().decode(result.stdout)).toContain(
        "Updated Noodle skill",
      )
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it("keeps curl installation successful when skill refresh fails", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "noodle-install-skill-fail-"),
    )
    const binDir = join(directory, "bin")
    const installDir = join(directory, "install")
    const home = join(directory, "home")
    const binary = `#!/usr/bin/env bash
exit 1
`
    try {
      await mkdir(join(home, ".codex", "skills", "noodle-use"), {
        recursive: true,
      })
      await mkdir(binDir, { recursive: true })
      const hash = createHash("sha256").update(binary).digest("hex")
      await writeFakeCurl(binDir, hash, binary)

      const result = await runInstaller(installDir, binDir, home)
      const stderr = new TextDecoder().decode(result.stderr)

      expect(result.exitCode).toBe(0)
      expect(stderr).toContain(
        "Noodle was installed, but its skill could not be refreshed",
      )
      expect(stderr).toContain("Retry with: noodle agent install")
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
