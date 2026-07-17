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
const notes = lines
  .slice(start, end === -1 ? undefined : end)
  .join("\n")
  .trim()

if (!notes) {
  console.error(`release-notes: CHANGELOG.md section for ${version} is empty`)
  process.exit(1)
}

console.log(notes)
