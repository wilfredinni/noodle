import { AsyncLocalStorage } from "node:async_hooks"
import { mkdir, realpath } from "node:fs/promises"
import { join } from "node:path"
import { isDeepStrictEqual } from "node:util"
import { acquireFileLock } from "../fileLock"
import type { Environment } from "../schema"
import { loadEnvironment } from "./load"

const heldLocks = new AsyncLocalStorage<{
  directory: string
  active: boolean
}>()
const queues = new Map<string, Promise<unknown>>()

export async function withEnvironmentLock<T>(
  dir: string,
  operation: () => Promise<T>,
): Promise<T> {
  await mkdir(dir, { recursive: true })
  const directory = await realpath(dir)
  const held = heldLocks.getStore()
  if (held?.active && held.directory === directory) return operation()

  // ponytail: one lock per environment directory also covers renames; split by name if contention matters.
  const task = (queues.get(directory) ?? Promise.resolve())
    .catch(() => {})
    .then(async () => {
      const lock = await acquireFileLock(join(directory, ".mutation"), {
        lockTimeoutMs: 5000,
        minBackoffMs: 10,
        maxBackoffMs: 50,
      })
      const context = { directory, active: true }
      try {
        return await heldLocks.run(context, operation)
      } finally {
        context.active = false
        await lock.release()
      }
    })
  queues.set(directory, task)
  try {
    return await task
  } finally {
    if (queues.get(directory) === task) queues.delete(directory)
  }
}

function metadata(environment: Environment) {
  const secrets = environment.secretVars ?? {}
  const publicEntries = (values: Record<string, string>) =>
    Object.fromEntries(
      Object.entries(values).filter(([key]) => !Object.hasOwn(secrets, key)),
    )
  return {
    name: environment.name,
    color: environment.color,
    vars: publicEntries(environment.vars),
    disabledVars: publicEntries(environment.disabledVars ?? {}),
    secrets: Object.fromEntries(
      Object.entries(secrets).map(([key, status]) => [
        key,
        status !== "disabled",
      ]),
    ),
  }
}

export async function assertEnvironmentUnchanged(
  dir: string,
  expected: Environment,
): Promise<void> {
  const current = await loadEnvironment(dir, expected.name, {
    resolveSecrets: false,
  })
  if (!isDeepStrictEqual(metadata(current), metadata(expected)))
    throw new Error("Environment changed on disk; reopen it before saving")
}
