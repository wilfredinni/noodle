import { describe, expect, it } from "bun:test"
import { setupKeymap } from "./_helpers"

describe("test helpers", () => {
  it("cleans keymap harnesses only once", () => {
    const { host, cleanup } = setupKeymap()

    cleanup()
    cleanup()

    expect(host.isDestroyed).toBe(true)
  })
})
