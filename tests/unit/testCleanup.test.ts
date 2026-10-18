import { describe, expect, it } from "bun:test"
import { removeTestDirectory } from "../testCleanup"

describe("temporary directory cleanup", () => {
  it.each(["EBUSY", "EMFILE", "ENFILE", "ENOTEMPTY", "EPERM"])(
    "retries %s even when Bun ignores native retry options",
    async (code) => {
      let attempts = 0
      await removeTestDirectory("owned-temp-directory", async () => {
        if (++attempts === 1) throw Object.assign(new Error(code), { code })
      })
      expect(attempts).toBe(2)
    },
  )

  it("preserves permanent errors without retrying", async () => {
    const error = Object.assign(new Error("access denied"), { code: "EACCES" })
    let attempts = 0
    await expect(
      removeTestDirectory("owned-temp-directory", async () => {
        attempts++
        throw error
      }),
    ).rejects.toBe(error)
    expect(attempts).toBe(1)
  })

  it("bounds retries and preserves the final cleanup error", async () => {
    const error = Object.assign(new Error("still locked"), { code: "EBUSY" })
    let attempts = 0
    await expect(
      removeTestDirectory("owned-temp-directory", async () => {
        attempts++
        throw error
      }),
    ).rejects.toBe(error)
    expect(attempts).toBe(6)
  })
})
