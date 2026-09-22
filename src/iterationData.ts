import { open } from "node:fs/promises"
import { extname, resolve } from "node:path"
import { parse } from "csv-parse/sync"
import { SCRIPT_LIMITS, validateJson } from "./preRequestScript"
import { isValidVariableName } from "./variableReference"
import type { JsonValue } from "./schema"

export const DATA_LIMITS = Object.freeze({
  bytes: 5 * 1024 * 1024,
  rows: 1000,
  executions: 10000,
})

export async function loadIterationData(
  path: string,
  baseDir = process.cwd(),
): Promise<Record<string, JsonValue>[]> {
  const file = await open(resolve(baseDir, path), "r")
  let text: string
  try {
    const stat = await file.stat()
    if (!stat.isFile()) throw Error("Data path must be a regular file")
    if (stat.size > DATA_LIMITS.bytes) throw Error("Data file exceeds 5 MiB")
    const buffer = Buffer.alloc(DATA_LIMITS.bytes + 1)
    let size = 0
    while (size < buffer.length) {
      const { bytesRead } = await file.read(
        buffer,
        size,
        buffer.length - size,
        null,
      )
      if (!bytesRead) break
      size += bytesRead
    }
    if (size > DATA_LIMITS.bytes) throw Error("Data file exceeds 5 MiB")
    text = new TextDecoder("utf-8", { fatal: true }).decode(
      buffer.subarray(0, size),
    )
  } finally {
    await file.close()
  }
  const checkName = (key: string) => {
    if (
      !isValidVariableName(key) ||
      ["__proto__", "prototype", "constructor"].includes(key)
    )
      throw Error(
        "Data variable names must contain only letters, numbers, or _ and must be safe",
      )
  }
  let rows: unknown
  const extension = extname(path).toLowerCase()
  if (extension === ".csv") {
    try {
      rows = parse(text, {
        bom: true,
        skip_empty_lines: true,
        columns: (headers: string[]) => {
          headers.forEach(checkName)
          if (new Set(headers).size !== headers.length)
            throw Error("Duplicate CSV headers")
          return headers
        },
      })
    } catch (error) {
      // Parser messages can contain cell values. Report structure, never row data.
      if (
        error instanceof Error &&
        (error.message.startsWith("Data variable") ||
          error.message === "Duplicate CSV headers")
      )
        throw error
      throw Error("Invalid CSV: check quoting and consistent record lengths")
    }
  } else if (extension === ".json") {
    try {
      rows = JSON.parse(text)
    } catch {
      throw Error("Invalid JSON data file")
    }
  } else throw Error("Data file must have a .csv or .json extension")
  if (!Array.isArray(rows) || rows.length === 0)
    throw Error(
      "Data must contain at least one row (JSON requires an array of objects)",
    )
  if (rows.length > DATA_LIMITS.rows) throw Error("Data exceeds 1,000 rows")
  return rows.map((row: unknown, index) => {
    if (row === null || typeof row !== "object" || Array.isArray(row))
      throw Error(`Data row ${index + 1} must be an object`)
    Object.keys(row).forEach(checkName)
    try {
      const data = validateJson(row) as Record<string, JsonValue>
      // Leave room for the iteration wrapper and bridge response envelope.
      if (
        Buffer.byteLength(JSON.stringify(data)) >
        SCRIPT_LIMITS.bridgeValueBytes - 128
      )
        throw Error("size")
      validateJson({ index, count: rows.length, data })
      return data
    } catch {
      throw Error(
        `Data row ${index + 1} exceeds sandbox value limits or contains unsafe values`,
      )
    }
  })
}

export function validateExecutionCount(requests: number, rows: number): void {
  if (requests * rows > DATA_LIMITS.executions)
    throw Error("Data run exceeds 10,000 request executions")
}

export function runResultKey(id: string, iteration?: number): string {
  return iteration === undefined ? id : `${iteration}:${id}`
}
