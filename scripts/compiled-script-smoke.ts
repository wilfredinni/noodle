import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

const binary = resolve(process.argv[2] ?? "./noodle")
const collection = await mkdtemp(join(tmpdir(), "noodle-compiled-script-"))
const marker = "compiled-quickjs-ok"

try {
  await writeFile(
    join(collection, "settings.yml"),
    "cookies:\n  enabled: false\n",
  )
  await writeFile(
    join(collection, "script.yml"),
    `name: Script
method: GET
url: https://example.com
scripts:
  pre: |-
    noodle.random.seed(42);
    if (noodle.random.uuid() !== "5fb9220d-9b0f-4d32-a248-6492457c3890")
      throw new Error("compiled-faker-seed-failed");
    if (noodle.time.format("2026-01-01", "YYYY-MM-DD HH:mm Z", { timeZone: "Asia/Kathmandu" }) !== "2026-01-01 05:45 +05:45")
      throw new Error("compiled-time-zone-failed");
    noodle.run.set("id", noodle.crypto.randomBytes(8, "hex"));
    noodle.request.headers.set("X-Request-ID", noodle.run.get("id"));
    throw new Error("${marker}")
`,
  )

  const run = Bun.spawnSync([
    binary,
    "request",
    "run",
    "script",
    "--collection",
    collection,
    "--json",
  ])
  const output = JSON.parse(run.stdout.toString())
  const result = output.data?.result
  if (
    run.exitCode !== 1 ||
    result?.failureCategories?.[0] !== "script" ||
    result?.scripts?.results?.[0]?.error?.message !== marker
  ) {
    throw new Error(
      `compiled pre-request script smoke failed: ${run.stderr.toString() || run.stdout.toString()}`,
    )
  }

  console.log("Compiled pre-request script smoke passed.")
} finally {
  await rm(collection, { recursive: true, force: true })
}
