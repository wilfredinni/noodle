const files = Array.from(
  new Bun.Glob("tests/**/*.test.{ts,tsx}").scanSync({ onlyFiles: true }),
).sort()

if (!files.length) {
  console.error("No test files found")
  process.exit(1)
}

// Bun 1.4.3's --isolate shares native allocator and FFI state between files.
for (const [index, file] of files.entries()) {
  console.log(`\n[${index + 1}/${files.length}] ${file}`)
  const result = Bun.spawnSync(
    [process.execPath, "test", `./${file}`, ...process.argv.slice(2)],
    { stdin: "inherit", stdout: "inherit", stderr: "inherit" },
  )
  if (!result.success) process.exitCode = 1
}
