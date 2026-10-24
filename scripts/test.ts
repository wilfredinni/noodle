const files = Array.from(
  new Bun.Glob("tests/**/*.test.{ts,tsx}").scanSync({ onlyFiles: true }),
).sort()

if (!files.length) {
  console.error("No test files found")
  process.exit(1)
}

// Keep OS state and nested runner fixtures exclusive; only unit files overlap.
if (process.platform === "win32") {
  const exclusive = new Set([
    "tests/unit/clipboard.test.ts",
    "tests/unit/externalEditor.test.ts",
    "tests/unit/testRunner.test.ts",
    "tests/unit/update.test.ts",
    "tests/unit/useUpdateFlow.test.tsx",
    "tests/unit/windows-update.test.ts",
  ])
  const canOverlap = (file: string) => {
    const path = file.replaceAll("\\", "/")
    return path.startsWith("tests/unit/") && !exclusive.has(path)
  }
  let next = 0
  async function worker(end: number) {
    while (next < end) {
      const index = next++
      const file = files[index]!
      console.log(`\n[${index + 1}/${files.length}] ${file}`)
      const child = Bun.spawn(
        [process.execPath, "test", `./${file}`, ...process.argv.slice(2)],
        { stdin: "inherit", stdout: "inherit", stderr: "inherit" },
      )
      if ((await child.exited) !== 0) {
        console.error(`Failed test file: ${file}`)
        process.exitCode = 1
      }
    }
  }
  while (next < files.length) {
    let end = next
    while (end < files.length && canOverlap(files[end]!)) end++
    if (end === next) await worker(next + 1)
    else await Promise.all([worker(end), worker(end)])
  }
} else {
  // Bun 1.4.3's --isolate shares native allocator and FFI state between files.
  for (const [index, file] of files.entries()) {
    console.log(`\n[${index + 1}/${files.length}] ${file}`)
    const result = Bun.spawnSync(
      [process.execPath, "test", `./${file}`, ...process.argv.slice(2)],
      { stdin: "inherit", stdout: "inherit", stderr: "inherit" },
    )
    if (!result.success) process.exitCode = 1
  }
}

export {}
