import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { parseArgs } from "node:util"
import pkg from "../package.json" with { type: "json" }

const { values } = parseArgs({
  options: {
    archive: { type: "string" },
    outfile: { type: "string" },
    local: { type: "boolean", default: false },
  },
})
if (!values.archive || !values.outfile)
  throw new Error(
    "Usage: bun scripts/prepare-homebrew-formula.ts --archive <source.tar.gz> --outfile <noodle.rb> [--local]",
  )
const archive = resolve(values.archive)
const checksum = createHash("sha256")
  .update(await readFile(archive))
  .digest("hex")
const url = values.local
  ? pathToFileURL(archive).href
  : `https://github.com/wilfredinni/noodle/archive/refs/tags/v${pkg.version}.tar.gz`
const template = await readFile(
  resolve(import.meta.dir, "../packaging/homebrew/noodle.rb.in"),
  "utf8",
)
const formula = template
  .replace("__NOODLE_SOURCE_URL__", url)
  .replace("__NOODLE_SOURCE_SHA256__", checksum)
const outfile = resolve(values.outfile)
await mkdir(dirname(outfile), { recursive: true })
await writeFile(outfile, formula)
console.log(`${outfile}: ${url} (${checksum})`)
