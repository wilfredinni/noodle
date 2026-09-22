import { resolve } from "node:path"

const root = resolve(import.meta.dir, "..")
const tagIndex = process.argv.indexOf("--tag")
const tag = tagIndex === -1 ? undefined : process.argv[tagIndex + 1]

if (!tag || !/^v\d+\.\d+\.\d+$/.test(tag)) {
  console.error("release-notes: pass --tag vX.Y.Z")
  process.exit(1)
}

const version = tag.slice(1)
const changelog = await Bun.file(resolve(root, "CHANGELOG.md")).text()
const lines = changelog.split("\n")
const heading = new RegExp(
  `^## \\[${version.replaceAll(".", "\\.")}\\](?:\\s|$)`,
)
const start = lines.findIndex((line) => heading.test(line))

if (start === -1) {
  console.error(`release-notes: CHANGELOG.md has no section for ${version}`)
  process.exit(1)
}

const end = lines.findIndex(
  (line, index) =>
    index > start && (/^## /.test(line) || /^\[[^\]]+\]:/.test(line)),
)
let fence: string | undefined
let prose = false
for (let index = start; index < (end === -1 ? lines.length : end); index++) {
  const line = lines[index].trim()
  const marker = line.match(/^(`{3,}|~{3,})/)
  if (fence) {
    if (line.startsWith(fence) && /^(`+|~+)\s*$/.test(line)) fence = undefined
    continue
  }
  if (marker) {
    fence = marker[1]
    prose = false
    continue
  }
  const block = /^(?:#{1,6}\s|[>|]|(?:[-*_]\s*){3,}$)/.test(line)
  const item = /^(?:[-*+]|\d+[.)])\s/.test(line)
  if (prose && line && !block && !item) {
    console.error(
      `release-notes: CHANGELOG.md:${index + 1}: keep each paragraph and list item on one physical line; remove manual wrapping`,
    )
    process.exit(1)
  }
  prose = Boolean(line) && !block
}
const notes = lines
  .slice(start, end === -1 ? undefined : end)
  .join("\n")
  .trim()

if (!notes) {
  console.error(`release-notes: CHANGELOG.md section for ${version} is empty`)
  process.exit(1)
}

console.log(notes)
