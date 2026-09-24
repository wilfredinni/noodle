const UNITS = {
  milliseconds: 1,
  seconds: 1000,
  minutes: 60_000,
  hours: 3_600_000,
  days: 86_400_000,
  weeks: 604_800_000,
} as const
const MAX_TIME = 8.64e15
const ISO =
  /^((?:\d{4}|[+-]\d{6})-(\d{2})-(\d{2}))(?:T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2}))?$/

export const TIME_METHODS = [
  {
    name: "now",
    min: 0,
    max: 0,
    signature: "now(): number",
    description: "Current Unix milliseconds.",
    example: "now",
  },
  {
    name: "unix",
    min: 0,
    max: 1,
    signature: "unix(value?: number | string): number",
    description: "Unix seconds, rounded down; defaults to now.",
    example: "unix",
  },
  {
    name: "fromUnix",
    min: 1,
    max: 1,
    signature: "fromUnix(seconds: number): number",
    description: "Convert Unix seconds to milliseconds.",
    example: "fromUnix(1767225600)",
  },
  {
    name: "parse",
    min: 1,
    max: 1,
    signature: "parse(text: string): number",
    description: "Parse an ISO date or timezone-bearing timestamp.",
    example: 'parse("2026-01-01")',
  },
  {
    name: "iso",
    min: 0,
    max: 1,
    signature: "iso(value?: number | string): string",
    description: "UTC ISO timestamp; defaults to now.",
    example: "iso",
  },
  {
    name: "format",
    min: 2,
    max: 3,
    signature:
      "format(value: number | string, pattern: string, options?: { timeZone?: string }): string",
    description: "Format a timestamp in UTC or a named IANA timezone.",
    example: 'format("2026-01-01", "YYYY-MM-DD")',
  },
  {
    name: "add",
    min: 3,
    max: 3,
    signature:
      "add(value: number | string, amount: number, unit: string): number",
    description: "Add an elapsed duration, returning milliseconds.",
    example: 'add("2026-01-01", 1, "days")',
  },
  {
    name: "subtract",
    min: 3,
    max: 3,
    signature:
      "subtract(value: number | string, amount: number, unit: string): number",
    description: "Subtract an elapsed duration, returning milliseconds.",
    example: 'subtract("2026-01-01", 1, "days")',
  },
  {
    name: "diff",
    min: 2,
    max: 3,
    signature:
      "diff(a: number | string, b: number | string, unit?: string): number",
    description: "Signed elapsed difference a - b; defaults to milliseconds.",
    example: 'diff("2026-01-02", "2026-01-01", "days")',
  },
] as const

export function createTimeHandlers(
  error: (message: string) => Error,
  now = () => Date.now(),
) {
  const fail = (message: string): never => {
    throw error(message)
  }
  const finite = (value: unknown): number =>
    typeof value === "number" && Number.isFinite(value)
      ? value
      : fail("expected a finite number")
  const clip = (value: number): number =>
    Number.isFinite(value) && Math.abs(value) <= MAX_TIME
      ? Math.trunc(value) || 0
      : fail("timestamp is outside the supported Date range")
  const parse = (value: unknown): number => {
    if (typeof value !== "string" || value.length > 64)
      return fail("expected an ISO date or timestamp with a timezone")
    const match = ISO.exec(value)
    if (!match || value.startsWith("-000000"))
      return fail("expected an ISO date or timestamp with a timezone")
    const [, date, month, day, hour, minute, second, zone] = match
    const year = Number(date!.slice(0, -6))
    // Gregorian dates repeat every 400 years; validate before clipping the instant.
    const calendar = new Date(
      Date.UTC(2000 + (year % 400), Number(month) - 1, Number(day)),
    )
    if (
      calendar.getUTCMonth() + 1 !== Number(month) ||
      calendar.getUTCDate() !== Number(day) ||
      (hour !== undefined &&
        (Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59)) ||
      (zone &&
        zone !== "Z" &&
        (Number(zone.slice(1, 3)) > 23 || Number(zone.slice(4)) > 59))
    )
      return fail("invalid ISO calendar date or time")
    return clip(Date.parse(zone ? value : `${date}T00:00:00.000Z`))
  }
  const instant = (value: unknown): number =>
    typeof value === "number" ? clip(value) : parse(value)
  const unit = (value: unknown): number =>
    typeof value === "string" && Object.hasOwn(UNITS, value)
      ? UNITS[value as keyof typeof UNITS]
      : fail(
          "unit must be milliseconds, seconds, minutes, hours, days, or weeks",
        )
  const format = (
    value: unknown,
    pattern: unknown,
    options: unknown,
  ): string => {
    const time = instant(value)
    if (typeof pattern !== "string" || !pattern.length || pattern.length > 512)
      return fail("pattern must contain 1 through 512 characters")
    let timeZone = "UTC"
    if (options !== undefined) {
      if (
        !options ||
        typeof options !== "object" ||
        Array.isArray(options) ||
        Object.keys(options).some((key) => key !== "timeZone")
      )
        return fail("options must contain only timeZone")
      if (Object.hasOwn(options, "timeZone")) {
        const zone = (options as { timeZone: unknown }).timeZone
        if (typeof zone !== "string" || zone.length > 128 || /^[+-]/.test(zone))
          return fail("timeZone must be UTC or a named IANA timezone")
        timeZone = zone
      }
    }
    let formatter: Intl.DateTimeFormat
    try {
      formatter = new Intl.DateTimeFormat("en-US-u-ca-gregory-nu-latn", {
        timeZone,
        year: "numeric",
        era: "short",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        fractionalSecondDigits: 3,
        hourCycle: "h23",
        timeZoneName: "longOffset",
      })
    } catch {
      return fail("timeZone must be UTC or a named IANA timezone")
    }
    const parts = Object.fromEntries(
      formatter.formatToParts(time).map(({ type, value }) => [type, value]),
    )
    const year =
      parts.era === "BC" ? 1 - Number(parts.year) : Number(parts.year)
    const offset = parts.timeZoneName!.replace(/^GMT/, "") || "+00:00"
    const tokens: Record<string, string> = {
      YYYY:
        year >= 0 && year <= 9999
          ? String(year).padStart(4, "0")
          : `${year < 0 ? "-" : "+"}${String(Math.abs(year)).padStart(6, "0")}`,
      MM: parts.month!,
      DD: parts.day!,
      HH: parts.hour!,
      mm: parts.minute!,
      ss: parts.second!,
      SSS: parts.fractionalSecond!,
      Z: offset,
      ZZ: offset.replaceAll(":", ""),
    }
    return pattern.replace(
      /\[([^[\]]*)\]|([A-Za-z])\2*|[[\]]/g,
      (token, literal: string | undefined) => {
        if (literal !== undefined) return literal
        if (!Object.hasOwn(tokens, token))
          return fail("unsupported pattern token or unmatched brackets")
        return tokens[token]!
      },
    )
  }
  const methods: Record<string, (args: unknown[]) => number | string> = {
    now: () => now(),
    unix: (args) => Math.floor((args.length ? instant(args[0]) : now()) / 1000),
    fromUnix: ([seconds]) => clip(finite(seconds) * 1000),
    parse: ([text]) => parse(text),
    iso: (args) =>
      new Date(args.length ? instant(args[0]) : now()).toISOString(),
    format: ([value, pattern, options]) => format(value, pattern, options),
    add: ([value, amount, units]) =>
      clip(instant(value) + finite(amount) * unit(units)),
    subtract: ([value, amount, units]) =>
      clip(instant(value) - finite(amount) * unit(units)),
    diff: (args) =>
      (instant(args[0]) - instant(args[1])) /
      unit(args.length === 3 ? args[2] : "milliseconds"),
  }
  return Object.fromEntries(
    TIME_METHODS.map(({ name, min, max }) => [
      `time.${name}`,
      (args: unknown[]) => {
        if (args.length < min || args.length > max)
          throw error(
            `time.${name}: expected ${min === max ? min : `${min} through ${max}`} arguments`,
          )
        return methods[name]!(args)
      },
    ]),
  )
}
