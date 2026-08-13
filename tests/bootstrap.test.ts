import { describe, it, expect, spyOn, afterAll } from "bun:test"
import { mkdtempSync, writeFileSync } from "node:fs"
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

  it("reports cookie flush failures before shutdown", async () => {
    const { flushCookieJarsForShutdown } = await import("../src/app/main")
    const messages: string[] = []
    const ok = await flushCookieJarsForShutdown(
      async () => {
        throw new Error("disk full")
      },
      (message) => messages.push(message),
    )
    expect(ok).toBe(false)
    expect(messages).toEqual([
      "warning: failed to flush cookie storage before shutdown: disk full",
    ])
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

  it("exits before rendering when collection settings are invalid", async () => {
    const tmpDir = tempDir()
    writeFileSync(
      join(tmpDir, "settings.yml"),
      "tls:\n  client_certifcates: []\n",
    )
    const exitSpy = spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit called")
    }) as never)
    const stderrSpy = spyOn(process.stderr, "write").mockImplementation(
      () => true,
    )

    try {
      const { bootstrap } = await import("../src/app/main")
      await expect(bootstrap({ collectionDir: tmpDir })).rejects.toThrow(
        "process.exit called",
      )
      expect(String(stderrSpy.mock.calls[0]?.[0])).toContain(
        'tls: unknown key "client_certifcates"',
      )
    } finally {
      exitSpy.mockRestore()
      stderrSpy.mockRestore()
    }
  })

  it("clears ambient proxy variables when --noproxy is used", async () => {
    const proxyKeys = [
      "HTTP_PROXY",
      "HTTPS_PROXY",
      "NO_PROXY",
      "http_proxy",
      "https_proxy",
      "no_proxy",
    ] as const
    const original = new Map(proxyKeys.map((key) => [key, process.env[key]]))
    process.env.HTTP_PROXY = "http://proxy.test:8080"
    const exitSpy = spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit called")
    }) as never)
    const stderrSpy = spyOn(process.stderr, "write").mockImplementation(
      () => true,
    )

    try {
      try {
        await bootstrapInvalidPath({ noProxy: true })
      } catch (error) {
        expect((error as Error).message).toBe("process.exit called")
      }
      for (const key of proxyKeys) expect(process.env[key]).toBeUndefined()
    } finally {
      for (const [key, value] of original) {
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
      }
      exitSpy.mockRestore()
      stderrSpy.mockRestore()
    }
  })

  async function bootstrapInvalidPath(options: { noProxy: boolean }) {
    const { bootstrap } = await import("../src/app/main")
    return bootstrap({
      collectionDir: join(tempDir(), "missing"),
      ...options,
    })
  }
})
