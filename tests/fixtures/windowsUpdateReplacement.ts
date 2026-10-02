import { writeFileSync } from "node:fs"

const args = process.argv.slice(2)
if (args[0] === "--version") {
  console.log(process.env.NOODLE_TEST_REPLACEMENT_VERSION ?? "1.2.3")
} else if (args[0] === "agent") {
  if (process.env.NOODLE_TEST_SKILL_MARKER) {
    writeFileSync(
      process.env.NOODLE_TEST_SKILL_MARKER,
      JSON.stringify({
        executable: process.execPath,
        args,
      }),
    )
  }
  process.exitCode = process.env.NOODLE_TEST_SKILL_FAIL === "1" ? 1 : 0
} else {
  process.exitCode = 1
}
