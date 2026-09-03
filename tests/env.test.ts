import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { env } from "../src/env"

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "noodle-env-"))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe("loadEnvironment — happy path", () => {
  it("loads a valid .env file", async () => {
    await writeFile(
      join(dir, "development.env"),
      "host=localhost:3000\ntoken=abc123\n",
      "utf8",
    )
    const environment = await env.loadEnvironment(dir, "development")
    expect(environment.name).toBe("development")
    expect(environment.vars).toEqual({
      host: "localhost:3000",
      token: "abc123",
    })
  })

  it("skips comments and empty lines", async () => {
    await writeFile(
      join(dir, "dev.env"),
      "# this is the dev env\n\nhost=localhost\n# db config\nport=3000\n\n",
      "utf8",
    )
    const result = await env.loadEnvironment(dir, "dev")
    expect(result.vars).toEqual({ host: "localhost", port: "3000" })
  })

  it("handles values containing = signs", async () => {
    await writeFile(
      join(dir, "dev.env"),
      "url=https://example.com/path?v=1&k=2\nkey=v1==v2\n",
      "utf8",
    )
    const result = await env.loadEnvironment(dir, "dev")
    expect(result.vars).toEqual({
      url: "https://example.com/path?v=1&k=2",
      key: "v1==v2",
    })
  })

  it("allows empty value", async () => {
    await writeFile(join(dir, "dev.env"), "flag=\nhost=api\n", "utf8")
    const result = await env.loadEnvironment(dir, "dev")
    expect(result.vars).toEqual({ flag: "", host: "api" })
  })

  it("trims trailing whitespace from key", async () => {
    await writeFile(join(dir, "dev.env"), "host  =value\n", "utf8")
    const result = await env.loadEnvironment(dir, "dev")
    expect(result.vars.host).toBe("value")
  })

  it("preserves values exactly after the first equals sign", async () => {
    await writeFile(
      join(dir, "dev.env"),
      "active=value  \r\n# disabled=old  \r\nempty=\r\n",
      "utf8",
    )
    const result = await env.loadEnvironment(dir, "dev")
    expect(result.vars).toEqual({ active: "value  ", empty: "" })
    expect(result.disabledVars).toEqual({ disabled: "old  " })
  })
})

describe("loadEnvironment — file errors", () => {
  it("throws prefixed error when file is missing", async () => {
    await expect(env.loadEnvironment(dir, "nope")).rejects.toThrow(
      `env.load: environment file not found: ${join(dir, "nope.env")}`,
    )
  })
})

describe("loadEnvironment — validation", () => {
  it("throws on empty key", async () => {
    await writeFile(join(dir, "bad.env"), "=value\nhost=x\n", "utf8")
    await expect(env.loadEnvironment(dir, "bad")).rejects.toThrow(
      "env.load: var name must not be empty",
    )
  })

  it("throws on line without = sign", async () => {
    await writeFile(join(dir, "bad.env"), "invalid_line\nhost=x\n", "utf8")
    await expect(env.loadEnvironment(dir, "bad")).rejects.toThrow(
      'env.load: invalid line (expected KEY=value): "invalid_line"',
    )
  })

  it("throws on path traversal in name", async () => {
    await expect(env.loadEnvironment(dir, "../secrets")).rejects.toThrow(
      "env.load: invalid environment name",
    )
    await expect(env.loadEnvironment(dir, "a/../b")).rejects.toThrow(
      "env.load: invalid environment name",
    )
  })

  it("rejects invalid and reserved keys", async () => {
    for (const line of ["bad-key=value\n", "# bad-key=value\n", "_color=x\n"]) {
      await writeFile(join(dir, "bad.env"), line, "utf8")
      await expect(env.loadEnvironment(dir, "bad")).rejects.toThrow(
        /env\.load: (invalid variable key|unknown _color)/,
      )
    }
  })
})

describe("loadEnvironment — disabled vars", () => {
  it("loads # KEY=value as disabled vars", async () => {
    await writeFile(
      join(dir, "dev.env"),
      "active=yes\n# hidden=old_value\nvisible=here\n# comment line\n",
      "utf8",
    )
    const result = await env.loadEnvironment(dir, "dev")
    expect(result.vars).toEqual({ active: "yes", visible: "here" })
    expect(result.disabledVars).toEqual({ hidden: "old_value" })
  })

  it("round-trips vars and disabled vars", async () => {
    await env.saveEnvironment(dir, {
      name: "rt",
      vars: { x: "1", y: "2" },
      disabledVars: { z: "3" },
    })
    const loaded = await env.loadEnvironment(dir, "rt")
    expect(loaded.vars).toEqual({ x: "1", y: "2" })
    expect(loaded.disabledVars).toEqual({ z: "3" })
  })

  it("handles env without disabled vars", async () => {
    await writeFile(join(dir, "simple.env"), "a=b\n", "utf8")
    const result = await env.loadEnvironment(dir, "simple")
    expect(result.disabledVars).toBeUndefined()
  })
})

describe("env priority resolution", () => {
  const envList = ["development", "production", "staging"]

  function resolveEnv(
    initialName?: string,
    settingsEnv?: string,
    list: string[] = envList,
  ): string | undefined {
    if (
      initialName !== undefined &&
      initialName !== "" &&
      list.includes(initialName)
    )
      return initialName
    if (settingsEnv !== undefined && list.includes(settingsEnv))
      return settingsEnv
    if (list.length > 0) return list[0]
    return undefined
  }

  it("CLI --env takes highest priority", () => {
    expect(resolveEnv("production", "development")).toBe("production")
  })

  it("falls back to settingsEnv when no CLI arg", () => {
    expect(resolveEnv(undefined, "staging")).toBe("staging")
  })

  it("falls back to first env when no CLI or settings", () => {
    expect(resolveEnv(undefined, undefined)).toBe("development")
  })

  it("returns undefined for empty envList", () => {
    expect(resolveEnv(undefined, undefined, [])).toBeUndefined()
  })
})
