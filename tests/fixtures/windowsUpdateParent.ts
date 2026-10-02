import { emitCommand } from "../../src/app/commandResult"
import { runUpdate, sha256 } from "../../src/app/commands/update"

if (process.argv[2] === "--version") {
  console.log("0.0.0")
} else {
  const source = process.env.NOODLE_TEST_UPDATE_SOURCE!
  const binary = await Bun.file(source).bytes()
  await emitCommand(true, () =>
    runUpdate(true, true, {
      execPath: process.execPath,
      platform: "win32",
      arch: "x64",
      env: process.env,
      cachePath: process.env.NOODLE_TEST_CACHE!,
      fetcher: async (input) =>
        String(input).endsWith("update.json")
          ? new Response(
              JSON.stringify({
                version: "v1.2.3",
                assets: { "windows-x86_64": { sha256: sha256(binary) } },
              }),
            )
          : new Response(binary),
    }),
  )
  if (process.env.NOODLE_TEST_HOLD_PARENT === "1") await Bun.stdin.text()
}
