import { resolve } from "node:path"

if (process.platform === "darwin") {
  const binary = process.argv[2]
  if (!binary)
    throw new Error("Usage: bun scripts/sign-macos-binary.ts <binary>")

  // Bun's embedded signature can be invalid even when its compiled binary runs
  // on the build host. Replace it before testing or generating release hashes.
  for (const args of [
    ["--force", "--sign", "-"],
    ["--verify", "--strict", "--verbose=2"],
  ]) {
    const result = Bun.spawnSync(["/usr/bin/codesign", ...args, resolve(binary)], {
      stdout: "inherit",
      stderr: "inherit",
    })
    if (result.exitCode !== 0) process.exit(result.exitCode || 1)
  }
}
