import { afterEach, describe, expect, it, setSystemTime } from "bun:test"
import {
  runRequestScript,
  SCRIPT_API_CONTRACT,
} from "../../src/preRequestScript"
import { createTimeHandlers, TIME_METHODS } from "../../src/scriptTime"
import { RunScope } from "../../src/runScope"

const handlers = createTimeHandlers((message) => new Error(message))
const call = (name: string, ...args: unknown[]) =>
  handlers[`time.${name}`]!(args)
const request = {
  id: "time",
  name: "Time",
  method: "GET" as const,
  url: "http://localhost/time",
  headers: {},
  params: [],
  timeout: 0,
}
const response = {
  status: 200,
  statusText: "OK",
  timeMs: 1,
  headers: {},
  body: "{}",
}
const run = (source: string, scope: RunScope, phase: "pre" | "post") =>
  runRequestScript(
    phase,
    source,
    request,
    undefined,
    scope,
    phase === "post" ? { response } : undefined,
  )

describe("script time API", () => {
  afterEach(() => setSystemTime())

  it("exposes every frozen method in both phases without replacing Date or random timestamps", async () => {
    const timestamp = "2026-01-01T00:00:00.123Z"
    const now = Date.parse(timestamp)
    setSystemTime(now)
    for (const phase of ["pre", "post"] as const) {
      const scope = new RunScope()
      const result = await run(
        `
        const t = noodle.time;
        noodle.run.set("surface", {
          names: Object.keys(t), frozen: Object.isFrozen(t),
          methodsFrozen: Object.values(t).every(Object.isFrozen),
          nullPrototype: Object.getPrototypeOf(t) === null, bare: typeof time,
          date: new Date(0).toISOString()
        });
        noodle.run.set("clock", [t.now(), t.unix(), t.iso(), noodle.random.timestamp(), noodle.random.isoTimestamp()]);
        noodle.run.set("values", {
          unix: t.unix(-1), fromUnix: t.fromUnix(1.5), parse: t.parse("2024-02-29"),
          iso: t.iso("2024-02-29T12:30:45.123+05:45"),
          format: t.format(0, "YYYY-MM-DD[T]HH:mm:ss.SSS Z ZZ"),
          add: t.add(0, 1.5, "seconds"), subtract: t.subtract(0, 1.5, "seconds"),
          diff: t.diff(1500, 0, "seconds")
        });`,
        scope,
        phase,
      )
      expect(result.result.success).toBe(true)
      expect(scope.get("surface")).toEqual({
        names: TIME_METHODS.map(({ name }) => name),
        frozen: true,
        methodsFrozen: true,
        nullPrototype: true,
        bare: "undefined",
        date: "1970-01-01T00:00:00.000Z",
      })
      expect(scope.get("values")).toEqual({
        unix: -1,
        fromUnix: 1500,
        parse: Date.parse("2024-02-29T00:00:00Z"),
        iso: "2024-02-29T06:45:45.123Z",
        format: "1970-01-01T00:00:00.000 +00:00 +0000",
        add: 1500,
        subtract: -1500,
        diff: 1.5,
      })
      expect(scope.get("clock")).toEqual([
        now,
        1767225600,
        timestamp,
        1767225600,
        timestamp,
      ])
      expect(
        SCRIPT_API_CONTRACT.filter(
          (entry) =>
            entry.member.startsWith("time.") && entry.phases.includes(phase),
        ).map((entry) => entry.member),
      ).toEqual(TIME_METHODS.map(({ name }) => `time.${name}`))
    }
  })

  it("parses strict calendar dates and offsets and clips sub-millisecond results", () => {
    for (const value of [
      "2024-02-29",
      "2000-02-29",
      "0000-02-29",
      "0099-01-01",
      "1969-12-31T23:59:59.999Z",
      "2026-01-01T00:00:00-03:00",
      "2026-01-01T00:00:00.123456Z",
      "+010000-01-01T00:00:00Z",
      "-000001-01-01T00:00:00Z",
      "-000400-02-29",
    ]) {
      expect(call("parse", value)).toBe(Date.parse(value))
      expect(call("iso", call("parse", value))).toBe(
        new Date(value).toISOString(),
      )
    }
    expect(call("fromUnix", -0.0019)).toBe(-1)
    expect(call("fromUnix", 0.0009)).toBe(0)
    expect(call("add", 0, 0.0019, "seconds")).toBe(1)
    expect(call("subtract", 0, 0.0019, "seconds")).toBe(-1)
    expect(call("iso", -0.9)).toBe("1970-01-01T00:00:00.000Z")
    expect(call("diff", "1970-01-02", 0)).toBe(86_400_000)
    expect(call("diff", 0, 1500, "seconds")).toBe(-1.5)
    for (const [unit, amount] of [
      ["milliseconds", 1],
      ["seconds", 1000],
      ["minutes", 60_000],
      ["hours", 3_600_000],
      ["days", 86_400_000],
      ["weeks", 604_800_000],
    ] as const)
      expect(call("add", 0, 1, unit)).toBe(amount)
    for (const value of [-8.64e15, 8.64e15]) {
      expect(call("iso", value)).toBe(new Date(value).toISOString())
      expect(call("parse", new Date(value).toISOString())).toBe(value)
    }
    expect(call("parse", "-271821-04-19T23:00:00-01:00")).toBe(-8.64e15)
    expect(call("parse", "+275760-09-13T01:00:00+01:00")).toBe(8.64e15)
  })

  it("accepts named timezone aliases containing digits and signs in both phases", async () => {
    for (const phase of ["pre", "post"] as const) {
      const scope = new RunScope()
      const result = await run(
        `noodle.run.set("aliases", ["EST5EDT", "CST6CDT", "MST7MDT", "PST8PDT", "GMT0", "GMT+0", "GMT-0"].map(timeZone => noodle.time.format(0, "YYYY-MM-DD HH:mm Z", { timeZone })));`,
        scope,
        phase,
      )
      expect(result.result.success).toBe(true)
      expect(scope.get("aliases")).toEqual([
        "1969-12-31 19:00 -05:00",
        "1969-12-31 18:00 -06:00",
        "1969-12-31 17:00 -07:00",
        "1969-12-31 16:00 -08:00",
        "1970-01-01 00:00 +00:00",
        "1970-01-01 00:00 +00:00",
        "1970-01-01 00:00 +00:00",
      ])
    }
  })

  it("formats UTC, seasonal zones, fractional offsets, DST and escaped literals", () => {
    const pattern = "YYYY-MM-DD HH:mm:ss.SSS Z ZZ"
    for (const [value, timeZone, expected] of [
      ["2026-01-01T00:00:00Z", "UTC", "2026-01-01 00:00:00.000 +00:00 +0000"],
      [
        "2026-01-15T12:00:00Z",
        "America/Santiago",
        "2026-01-15 09:00:00.000 -03:00 -0300",
      ],
      [
        "2026-07-15T12:00:00Z",
        "America/Santiago",
        "2026-07-15 08:00:00.000 -04:00 -0400",
      ],
      [
        "2026-01-01T00:00:00Z",
        "Asia/Kathmandu",
        "2026-01-01 05:45:00.000 +05:45 +0545",
      ],
      [
        "1800-01-01T00:00:00Z",
        "America/New_York",
        "1799-12-31 19:03:58.000 -04:56:02 -045602",
      ],
      [
        "2026-03-08T06:30:00Z",
        "America/New_York",
        "2026-03-08 01:30:00.000 -05:00 -0500",
      ],
      [
        "2026-03-08T07:30:00Z",
        "America/New_York",
        "2026-03-08 03:30:00.000 -04:00 -0400",
      ],
    ])
      expect(call("format", value, pattern, { timeZone })).toBe(expected)
    expect(call("format", 0, "[at] HH:mm [YYYY] []YYYYMMDD")).toBe(
      "at 00:00 YYYY 19700101",
    )
    for (const value of [
      "0000-01-01",
      "0099-01-01",
      "-000001-01-01",
      "+010000-01-01",
    ])
      expect(call("format", value, "YYYY-MM-DD")).toBe(value)
    const start = "2026-03-07T17:00:00Z"
    const end = call("add", start, 1, "days")
    expect(call("diff", end, start, "hours")).toBe(24)
    expect(call("format", end, "HH:mm", { timeZone: "America/New_York" })).toBe(
      "13:00",
    )
  })

  it("rejects ambiguous strings, invalid dates, overflow, patterns, options and arity", () => {
    for (const text of [
      "2023-02-29",
      "1900-02-29",
      "-000100-02-29",
      "2026-02-30",
      "2026-04-31",
      "2026-00-01",
      "2026-13-01",
      "2026-01-00",
      "2026-01-32",
      "2026-01-01T12:00:00",
      "2026-01-01T24:00:00Z",
      "2026-01-01T00:60:00Z",
      "2026-01-01T00:00:60Z",
      "2026-01-01T00:00:00+24:00",
      "2026-01-01T00:00:00+00:60",
      "-000000-01-01",
      "-271821-04-19T22:59:59.999-01:00",
      "+275760-09-13T01:00:00.001+01:00",
      "01/02/2026",
      "tomorrow",
      "0",
      "",
      "2026-01-01\n",
      "x".repeat(65),
    ])
      expect(() => call("parse", text)).toThrow()
    for (const [name, args] of [
      ["now", [1]],
      ["iso", [0, 0]],
      ["parse", []],
      ["parse", [0]],
      ["unix", [null]],
      ["fromUnix", ["1"]],
      ["fromUnix", [Infinity]],
      ["iso", [NaN]],
      ["iso", [8.64e15 + 1]],
      ["iso", [-8.64e15 - 1]],
      ["fromUnix", [1e100]],
      ["add", [8.64e15, 1, "milliseconds"]],
      ["subtract", [-8.64e15, 1, "milliseconds"]],
      ["add", [0, 1e308, "weeks"]],
      ["add", [0, 1, "months"]],
      ["add", [0, 1, "toString"]],
      ["subtract", [0, "1", "days"]],
      ["diff", [0, 1, null]],
      ["format", [0, "YYYY", null]],
      ["format", [0, "YYYY", []]],
      ["format", [0, "YYYY", { locale: "en" }]],
      ["format", [0, "YYYY", { timeZone: null }]],
      ["format", [0, "YYYY", { timeZone: "Missing/Zone" }]],
      ["format", [0, "YYYY", { timeZone: "+01:00" }]],
      ["format", [0, "YYYY", { timeZone: "-01:00" }]],
      ["format", [0, "YYYY", { timeZone: "+0100" }]],
      ["format", [0, "YYYY", { timeZone: "-01" }]],
      ["format", [0, "YYYY", { timeZone: "" }]],
      ["format", [0, "YYYY", { timeZone: "x".repeat(129) }]],
    ] as [string, unknown[]][])
      expect(() => call(name, ...args)).toThrow()
    for (const pattern of [
      "",
      "YYYYY",
      "MMMM",
      "hh",
      "YY",
      "YYYY-MM-DDTHH:mm:ss",
      "[open",
      "close]",
      "[[nested]]",
      "a".repeat(513),
    ])
      expect(() => call("format", 0, pattern)).toThrow()
    expect(call("format", 0, " ".repeat(512))).toHaveLength(512)
  })

  it("keeps validation inside the existing bridge and rolls back staged writes", async () => {
    for (const phase of ["pre", "post"] as const) {
      for (const source of [
        'noodle.time.parse("2026-02-30")',
        'noodle.time.format(0, "MMMM")',
        'noodle.time.format(0, "YYYY", {timeZone: "Missing/Zone"})',
        'noodle.time.add(0, Infinity, "seconds")',
        "noodle.time.iso(new Date())",
        'noodle.time.format(0, "YYYY", {get timeZone() { throw Error("getter executed") }})',
        'noodle.time.format(0, "x".repeat(300000))',
      ]) {
        const scope = new RunScope()
        const result = await run(
          `noodle.run.set("staged", true); ${source};`,
          scope,
          phase,
        )
        expect(result.result.success).toBe(false)
        expect(result.result.error?.name).toBe("ScriptApiValidationError")
        expect(result.result.error?.message).not.toContain("getter executed")
        expect(scope.get("staged")).toBeUndefined()
      }
      const result = await run(
        '"use strict"; noodle.time.now.extra = true;',
        new RunScope(),
        phase,
      )
      expect(result.result.success).toBe(false)
    }
  })
})
