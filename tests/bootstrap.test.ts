import { describe, it, expect, spyOn, afterAll } from "bun:test"
import { mkdtempSync } from "node:fs"
import { rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"

describe("bootstrap", () => {
  const tempDirs: string[] = []

  afterAll(() => {
    for (const dir of tempDirs) {
      try {
        rmSync(dir, { recursive: true, force: true })
      } catch {
        // ignore cleanup failures
      }
    }
  })

  function tempDir(): string {
    const dir = mkdtempSync(join(tmpdir(), "noodle-bootstrap-test-"))
    tempDirs.push(dir)
    return dir
  }

  it("exports bootstrap function", async () => {
    const mod = await import("../src/app/main")
    expect(typeof mod.bootstrap).toBe("function")
  })

  it("exits with error when env name not found", async () => {
    const tmpDir = tempDir()
    const exitSpy = spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit called")
    }) as never)
    const stderrSpy = spyOn(process.stderr, "write").mockImplementation(
      () => true,
    )

    try {
      const { bootstrap } = await import("../src/app/main")
      await bootstrap({ collectionDir: tmpDir, envName: "nonexistent" })
    } catch (e) {
      expect((e as Error).message).toBe("process.exit called")
    }

    expect(stderrSpy).toHaveBeenCalled()
    expect(String(stderrSpy.mock.calls[0]?.[0])).toContain("nonexistent")

    exitSpy.mockRestore()
    stderrSpy.mockRestore()
  })
})
