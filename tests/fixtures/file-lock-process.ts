import { acquireFileLock } from "../../src/fileLock"

const file = Bun.argv[2]
if (!file) throw new Error("Missing lock fixture path")
const lock = await acquireFileLock(file, {
  lockTimeoutMs: 5000,
  minBackoffMs: 1,
  maxBackoffMs: 5,
  recoverDeadOwner: true,
})
try {
  console.log("locked")
  await Bun.stdin.text()
} finally {
  await lock.release()
}
