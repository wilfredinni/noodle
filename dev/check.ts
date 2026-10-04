import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { load, dump } from "js-yaml"
import {
  collectionAudit,
  collectionRun,
  requestRun,
  type RunFailureCategory,
} from "../src/app/services"
import { setSecretBackendForTests, setStoredSecret } from "../src/secrets"
import { setCookieJarStorageForTests } from "../src/cookies"
import { startDevServer, collectionDir } from "./server"
import { checkProtocols } from "./protocols"
import { checkExecution } from "./execution"
import { developmentSecrets } from "./auth"

export async function checkCollection(
  services: Awaited<ReturnType<typeof startDevServer>>,
) {
  const workspace = await mkdtemp(join(tmpdir(), "noodle-development-"))
  const root = join(workspace, "collection")
  const secrets = new Map<string, string>()
  const processSecrets = Object.fromEntries(
    Object.keys(developmentSecrets).map((key) => [key, process.env[key]]),
  )
  const collectionId = crypto.randomUUID()
  setSecretBackendForTests({
    get: async ({ service, name }) => secrets.get(`${service}:${name}`) ?? null,
    set: async ({ service, name, value }) => {
      secrets.set(`${service}:${name}`, value)
    },
    delete: async ({ service, name }) => secrets.delete(`${service}:${name}`),
  })
  setCookieJarStorageForTests({
    configDir: workspace,
    keyLockFile: join(workspace, "cookie-key"),
  })
  try {
    for (const key of Object.keys(developmentSecrets)) delete process.env[key]
    await cp(collectionDir, root, {
      recursive: true,
      filter: (path) =>
        !path.includes(`${collectionDir}/.timeline`) &&
        !path.includes(`${collectionDir}/.noodle`),
    })
    const env =
      [
        "_color=success",
        ...Object.entries(services.urls).map(
          ([key, value]) => `${key}=${value}`,
        ),
        `fixture_dir=${join(root, "fixtures")}`,
        ...Object.keys(developmentSecrets).map(
          (key) => `# @secret ${key}\n${key}=`,
        ),
        "message=local development",
        "user_id=1",
        "post_id=1",
      ].join("\n") + "\n"
    await writeFile(join(root, ".environments/development.env"), env)
    const settings = load(
      await readFile(join(root, "settings.yml"), "utf8"),
    ) as Record<string, unknown>
    settings.collection_id = collectionId
    const tls = settings.tls as { client_certificates: { port: number }[] }
    tls.client_certificates[0]!.port = Number(
      new URL(services.urls.https_url).port,
    )
    await writeFile(join(root, "settings.yml"), dump(settings))
    for (const [key, value] of Object.entries(developmentSecrets)) {
      await setStoredSecret(root, "development", key, value)
    }
    const audit = await collectionAudit(root, false)
    if (!audit.valid)
      throw Error(
        `Development collection audit failed: ${JSON.stringify(audit.issues)}`,
      )
    services.reset()
    const smoke = await collectionRun(
      root,
      "development",
      undefined,
      true,
      undefined,
      false,
      [],
      ["smoke"],
    )
    if (smoke.failed)
      throw Error(
        `Smoke failures: ${JSON.stringify(smoke.results.filter((result) => !result.ok))}`,
      )
    const failures = JSON.parse(
      await readFile(join(import.meta.dir, "failures.json"), "utf8"),
    ) as Record<string, RunFailureCategory>
    for (const [id, category] of Object.entries(failures)) {
      const run = await requestRun(id, root, "development", undefined, true)
      if (!run.failed || !run.result.failureCategories.includes(category))
        throw Error(
          `Expected ${category} for ${id}, got ${JSON.stringify(run.result)}`,
        )
    }
    const datasets = []
    for (const extension of ["csv", "json"]) {
      services.reset()
      const run = await collectionRun(
        root,
        "development",
        undefined,
        true,
        undefined,
        false,
        ["scripting-data/"],
        [],
        [],
        false,
        undefined,
        0,
        join(root, `scripting-data/users.${extension}`),
      )
      if (run.failed || run.results.length !== 4)
        throw Error(
          `Dataset ${extension} failed: ${JSON.stringify(run.results)}`,
        )
      datasets.push(run.summary)
    }
    const protocols = await checkProtocols(services, root)
    const execution = await checkExecution(root)
    return {
      smoke: smoke.summary,
      negative: Object.keys(failures).length,
      datasets,
      protocols,
      execution,
    }
  } finally {
    for (const [key, value] of Object.entries(processSecrets)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    setSecretBackendForTests(undefined)
    setCookieJarStorageForTests()
    await rm(workspace, { recursive: true, force: true })
  }
}

if (import.meta.main) {
  const services = await startDevServer({
    http: 0,
    https: 0,
    alternate: 0,
    proxy: 0,
  })
  try {
    console.log(JSON.stringify(await checkCollection(services), null, 2))
  } finally {
    await services.close()
  }
}
