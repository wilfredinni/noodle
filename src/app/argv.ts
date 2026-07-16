export function getUserArgsStart(argv: string[]): number {
  // Bun puts compiled entrypoints under /$bunfs; source runs may include
  // extra arguments before the .ts entrypoint (for example, `bun run`).
  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i]!
    if (arg.endsWith(".ts") || arg.includes("$bunfs")) {
      return i + 1
    }
  }

  // Standard executable argv is [executable, entrypoint, ...userArgs].
  return 2
}
