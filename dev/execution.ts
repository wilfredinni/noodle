import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import {
  collectionRun,
  requestRun,
  cookieList,
  cookieClear,
} from "../src/app/services"
import { loadEnvironment } from "../src/env/load"

export async function checkExecution(root: string) {
  const run = (id: string, output?: string) =>
    requestRun(
      id,
      root,
      "development",
      undefined,
      true,
      undefined,
      false,
      output,
    )
  const capture = await run("interactive/persistent-capture")
  assert.equal(capture.failed, false)
  assert.equal(
    (await loadEnvironment(join(root, ".environments"), "development")).vars
      .saved_user,
    "Bret",
  )
  const script = await run("interactive/persistent-script")
  assert.equal(script.failed, false)
  let environment = await loadEnvironment(
    join(root, ".environments"),
    "development",
  )
  assert.equal(environment.vars.saved_script, "local")
  assert.equal(environment.vars.saved_secret, "development-only")
  const secret = await run("interactive/persistent-capture-secret")
  assert.equal(secret.failed, false)
  assert(!JSON.stringify(secret.result).includes("Bret"))
  assert.equal(
    (await loadEnvironment(join(root, ".environments"), "development")).vars
      .saved_user_secret,
    "Bret",
  )
  assert.equal((await run("interactive/persistent-unset")).failed, false)
  environment = await loadEnvironment(
    join(root, ".environments"),
    "development",
  )
  assert.equal(environment.vars.saved_script, undefined)
  assert.equal(environment.vars.saved_secret, undefined)
  await cookieClear(root)
  assert.equal((await run("cookies/01-receive")).failed, false)
  const stored = await cookieList(root)
  assert.equal(stored.state, "encrypted")
  const session = stored.cookies.find((cookie) => cookie.name === "session")
  assert(session?.httpOnly && session.hostOnly && session.sameSite === "lax")
  assert(
    stored.cookies.some(
      (cookie) => cookie.name === "scoped" && cookie.path === "/cookies",
    ),
  )
  assert(
    stored.cookies.some(
      (cookie) =>
        cookie.name === "secure" &&
        cookie.secure &&
        cookie.sameSite === "strict",
    ),
  )
  const expired = stored.cookies.find((cookie) => cookie.name === "expired")
  assert(
    !expired || (expired.expires && Date.parse(expired.expires) <= Date.now()),
  )
  assert.equal((await run("cookies/scope")).failed, false)
  assert.equal((await run("cookies/suppressed")).failed, false)
  assert.equal((await run("cookies/delete")).failed, false)
  const deleted = (await cookieList(root)).cookies.find(
    (cookie) => cookie.name === "session",
  )
  assert(
    !deleted || (deleted.expires && Date.parse(deleted.expires) <= Date.now()),
  )
  const rollback = await collectionRun(
    root,
    "development",
    undefined,
    true,
    undefined,
    false,
    ["transactions/"],
  )
  assert.equal(rollback.failed, true)
  assert.deepEqual(
    rollback.results.map((result) => result.ok),
    [true, false, false, true],
  )
  assert(rollback.results[1]!.failureCategories.includes("script"))
  assert(rollback.results[2]!.failureCategories.includes("script"))
  const targeted = await collectionRun(
    root,
    "development",
    undefined,
    true,
    undefined,
    false,
    ["runner/", "runner/nested/second"],
    ["runner", "nested"],
  )
  assert.deepEqual(
    targeted.results.map((result) => result.id),
    ["runner/nested/second"],
  )
  const excluded = await collectionRun(
    root,
    "development",
    undefined,
    true,
    undefined,
    false,
    ["runner/"],
    ["runner"],
    ["second"],
  )
  assert.deepEqual(
    excluded.results.map((result) => result.id),
    ["runner/first"],
  )
  const paced = await collectionRun(
    root,
    "development",
    undefined,
    true,
    undefined,
    false,
    ["runner/"],
    [],
    [],
    false,
    undefined,
    20,
  )
  assert.equal(paced.summary.requestSuccesses, 2)
  assert(paced.summary.durationMs >= 20)
  const failFast = await collectionRun(
    root,
    "development",
    undefined,
    true,
    undefined,
    false,
    ["negative/status-500", "runner/"],
    [],
    [],
    true,
  )
  assert.equal(failFast.summary.requestFailures, 1)
  assert(failFast.skipped.length > 0)
  const iterationResults = []
  for (const extension of ["csv", "json"]) {
    const dataset = await collectionRun(
      root,
      "development",
      undefined,
      true,
      undefined,
      false,
      ["runner-data/"],
      [],
      [],
      false,
      undefined,
      0,
      join(root, `scripting-data/users.${extension}`),
    )
    assert.equal(dataset.failed, false)
    assert.equal(dataset.iterations, 2)
    assert.deepEqual(
      dataset.results.map((result) => result.iteration),
      [0, 0, 1, 1],
    )
    iterationResults.push(dataset.summary)
  }
  const downloadPath = join(root, "downloaded.png")
  const downloaded = await run("responses/image", downloadPath)
  assert.equal(downloaded.failed, false)
  assert.deepEqual(
    await readFile(downloadPath),
    await readFile(join(root, "fixtures/image.png")),
  )
  await assert.rejects(run("responses/image", downloadPath), /already exists/)
  const redacted = await run("templates/types-and-redaction")
  assert.equal(redacted.failed, false)
  assert(JSON.stringify(redacted.result).includes("[REDACTED]"))
  return {
    persistence: true,
    rollback: true,
    downloads: true,
    runner: true,
    iterations: iterationResults,
  }
}
