import { createHash } from "node:crypto"
import {
  appendFileSync,
  chmodSync,
  copyFileSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs"
import { join } from "node:path"
import {
  compareStableVersions,
  parseManifest,
} from "../src/app/commands/updateManifest"

export const releaseTargets = [
  {
    target: "darwin-arm64",
    platform: "macos-arm64",
    asset: "noodle-macos-arm64",
  },
  {
    target: "darwin-x64",
    platform: "macos-x86_64",
    asset: "noodle-macos-x86_64",
  },
  {
    target: "linux-arm64",
    platform: "linux-arm64",
    asset: "noodle-linux-arm64",
  },
  {
    target: "linux-x64",
    platform: "linux-x86_64",
    asset: "noodle-linux-x86_64",
  },
  {
    target: "win32-x64",
    platform: "windows-x86_64",
    asset: "noodle-windows-x86_64.exe",
  },
] as const
const artifactNames: string[] = releaseTargets.map(
  ({ asset }) => `validated-${asset}`,
)
const bunVersion = "1.4.2"

function regularFile(path: string): Buffer {
  const stat = lstatSync(path)
  if (!stat.isFile() || stat.size === 0)
    throw new Error(`Expected nonempty regular file: ${path}`)
  return readFileSync(path)
}
function hash(content: Buffer): string {
  return createHash("sha256").update(content).digest("hex")
}
function identity(sha: string, version: string) {
  if (
    !/^[a-f0-9]{40}$/.test(sha) ||
    compareStableVersions(`v${version}`, `v${version}`) === null
  )
    throw new Error("Invalid release commit or version")
}

export function recordArtifact(
  directory: string,
  output: string,
  target: string,
  sha: string,
  version: string,
  runId: string,
) {
  identity(sha, version)
  const entry = releaseTargets.find((entry) => entry.target === target)
  if (!entry || !/^\d+$/.test(runId) || Bun.version !== bunVersion)
    throw new Error("Invalid artifact producer")
  const binary = join(directory, entry.asset)
  const sha256 = hash(regularFile(binary))
  mkdirSync(output)
  copyFileSync(binary, join(output, entry.asset))
  writeFileSync(
    join(output, "metadata.json"),
    JSON.stringify(
      {
        formatVersion: 1,
        commit: sha,
        version,
        target,
        asset: entry.asset,
        bun: Bun.version,
        runId,
        sha256,
      },
      null,
      2,
    ) + "\n",
  )
}

export function verifyArtifacts(
  directory: string,
  output: string,
  sha: string,
  version: string,
  runId: string,
) {
  identity(sha, version)
  if (
    !lstatSync(directory).isDirectory() ||
    readdirSync(directory).sort().join() !== [...artifactNames].sort().join()
  )
    throw new Error("Expected exactly five validated artifacts")
  // Validate the whole batch before making any binary available for publication.
  const binaries = releaseTargets.map((entry) => {
    const folder = join(directory, `validated-${entry.asset}`)
    if (
      !lstatSync(folder).isDirectory() ||
      readdirSync(folder).sort().join() !==
        [entry.asset, "metadata.json"].sort().join()
    )
      throw new Error(`Invalid artifact contents: ${entry.asset}`)
    const metadata = JSON.parse(
      regularFile(join(folder, "metadata.json")).toString(),
    )
    for (const [key, expected] of Object.entries({
      formatVersion: 1,
      commit: sha,
      version,
      target: entry.target,
      asset: entry.asset,
      bun: bunVersion,
      runId,
    })) {
      if (metadata?.[key] !== expected)
        throw new Error(`Artifact ${entry.asset}: incorrect ${key}`)
    }
    const path = join(folder, entry.asset)
    if (metadata.sha256 !== hash(regularFile(path)))
      throw new Error(`Artifact ${entry.asset}: checksum mismatch`)
    return { ...entry, path }
  })
  mkdirSync(output)
  for (const entry of binaries) {
    const path = join(output, entry.asset)
    copyFileSync(entry.path, path)
    if (entry.target !== "win32-x64") chmodSync(path, 0o755)
  }
}

type Run = {
  id: number
  head_sha: string
  head_branch: string
  event: string
  path: string
  status: string
  conclusion: string | null
  repository: { full_name: string }
  head_repository: { full_name: string }
}
type Artifact = {
  id: number
  name: string
  expired: boolean
  size_in_bytes: number
}
type Api = (endpoint: string) => Promise<unknown[]>

export async function resolveCI(
  repo: string,
  sha: string,
  api: Api,
  sleep = Bun.sleep,
  now = Date.now,
) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || !/^[a-f0-9]{40}$/.test(sha))
    throw new Error("Invalid repository or commit")
  const pages = await api(
    `repos/${repo}/actions/workflows/ci.yml/runs?head_sha=${sha}&branch=main&event=push&per_page=100`,
  )
  if (!pages.length) throw new Error("Invalid workflow runs response")
  const runs = pages
    .flatMap((page) => {
      const runs = (page as { workflow_runs?: Run[] })?.workflow_runs
      if (!Array.isArray(runs))
        throw new Error("Invalid workflow runs response")
      return runs
    })
    .filter(
      (run) =>
        run.repository?.full_name === repo &&
        run.head_repository?.full_name === repo &&
        run.path === ".github/workflows/ci.yml" &&
        run.head_sha === sha &&
        run.head_branch === "main" &&
        run.event === "push",
    )
  const selected = runs.sort((a, b) => b.id - a.id)[0]
  if (!selected) return { reuse: false, reason: "No push CI for this commit" }
  if (!Number.isSafeInteger(selected.id) || selected.id < 1)
    throw new Error("Invalid CI run ID")
  let run = selected
  const deadline = now() + 15 * 60 * 1000
  while (run.status !== "completed") {
    if (now() >= deadline)
      throw new Error(`CI ${run.id} did not finish within fifteen minutes`)
    await sleep(15_000)
    const response = await api(`repos/${repo}/actions/runs/${selected.id}`)
    run = response[0] as Run
    if (
      run?.id !== selected.id ||
      run.head_sha !== sha ||
      run.repository?.full_name !== repo ||
      run.head_repository?.full_name !== repo ||
      run.head_branch !== "main" ||
      run.event !== "push" ||
      run.path !== ".github/workflows/ci.yml"
    )
      throw new Error("CI identity changed while waiting")
  }
  if (run.conclusion !== "success")
    throw new Error(`CI ${run.id} ended with ${run.conclusion}`)
  const artifactPages = await api(
    `repos/${repo}/actions/runs/${run.id}/artifacts?per_page=100`,
  )
  if (!artifactPages.length) throw new Error("Invalid artifacts response")
  const artifacts = artifactPages
    .flatMap((page) => {
      const artifacts = (page as { artifacts?: Artifact[] })?.artifacts
      if (!Array.isArray(artifacts))
        throw new Error("Invalid artifacts response")
      return artifacts
    })
    .filter(({ name }) => name.startsWith("validated-"))
  if (
    artifacts.some(({ name }) => !artifactNames.includes(name)) ||
    new Set(artifacts.map(({ name }) => name)).size !== artifacts.length
  )
    throw new Error("Unexpected or duplicate validated artifacts")
  if (
    artifacts.some(
      ({ id, size_in_bytes, expired }) =>
        !Number.isSafeInteger(id) ||
        id < 1 ||
        !Number.isSafeInteger(size_in_bytes) ||
        size_in_bytes <= 0 ||
        typeof expired !== "boolean",
    )
  )
    throw new Error("Invalid validated artifact")
  if (artifacts.length !== 5 || artifacts.some(({ expired }) => expired))
    return {
      reuse: false,
      reason: `CI ${run.id} artifacts are missing or expired`,
    }
  return {
    reuse: true,
    runId: String(run.id),
    artifactIds: artifacts.map(({ id }) => id).join(","),
    reason: `Reuse successful push CI ${run.id}`,
  }
}

export function buildManifest(tag: string, checksums: string) {
  const entries = new Map<string, string>()
  for (const line of checksums.trim().split(/\r?\n/)) {
    const match = /^([a-f0-9]{64})  (noodle-[\w.-]+)$/.exec(line)
    if (
      !match ||
      entries.has(match[2]) ||
      !releaseTargets.some(({ asset }) => asset === match[2])
    )
      throw new Error("Invalid or duplicate release checksum")
    entries.set(match[2], match[1])
  }
  const assets = Object.fromEntries(
    releaseTargets.map(({ asset, platform }) => {
      const sha256 = entries.get(asset)
      if (!sha256) throw new Error(`Missing ${platform} checksum`)
      return [platform, { sha256 }]
    }),
  )
  return parseManifest(JSON.stringify({ version: tag, assets }))
}

export function updateManifest(nextPath: string, currentPath: string) {
  const next = parseManifest(regularFile(nextPath).toString())
  const current = parseManifest(regularFile(currentPath).toString())
  if (compareStableVersions(current.version, next.version) === -1)
    throw new Error(
      `Refusing manifest downgrade from ${current.version} to ${next.version}`,
    )
  if (
    current.version === next.version &&
    JSON.stringify(current.assets) !== JSON.stringify(next.assets)
  ) {
    // Object key order is irrelevant, but published binaries must remain immutable.
    if (
      releaseTargets.some(
        ({ platform }) =>
          current.assets[platform]?.sha256 !== next.assets[platform]?.sha256,
      )
    )
      throw new Error("Published version has different checksums")
  }
  copyFileSync(nextPath, currentPath)
}

export function verifyPublished(directory: string, tag: string) {
  const expected = [
    ...releaseTargets.map(({ asset }) => asset),
    "SHA256SUMS",
  ].sort()
  if (
    !lstatSync(directory).isDirectory() ||
    readdirSync(directory).sort().join() !== expected.join()
  )
    throw new Error("Unexpected published release assets")
  const manifest = buildManifest(
    tag,
    regularFile(join(directory, "SHA256SUMS")).toString(),
  )
  for (const { asset, platform } of releaseTargets) {
    if (
      hash(regularFile(join(directory, asset))) !==
      manifest.assets[platform].sha256
    )
      throw new Error(`Published checksum mismatch: ${asset}`)
  }
}

if (import.meta.main) {
  const [command, ...args] = process.argv.slice(2)
  switch (command) {
    case "record": {
      const sha = Bun.spawnSync(["git", "rev-parse", "HEAD"])
        .stdout.toString()
        .trim()
      const { version } = JSON.parse(readFileSync("package.json", "utf8"))
      recordArtifact(
        ".",
        "validated-build",
        args[0],
        sha,
        version,
        process.env.GITHUB_RUN_ID!,
      )
      break
    }
    case "resolve": {
      const result = await resolveCI(
        process.env.GH_REPO!,
        process.env.RELEASE_SHA!,
        async (endpoint) => {
          const process = Bun.spawn(
            ["gh", "api", "--paginate", "--slurp", endpoint],
            { stdout: "pipe", stderr: "inherit" },
          )
          const json = await new Response(process.stdout).text()
          if ((await process.exited) !== 0)
            throw new Error("GitHub API request failed")
          const pages = JSON.parse(json)
          if (!Array.isArray(pages))
            throw new Error("Invalid paginated GitHub response")
          return pages
        },
      )
      appendFileSync(
        process.env.GITHUB_OUTPUT!,
        `reuse=${result.reuse}\nrun-id=${result.runId ?? process.env.GITHUB_RUN_ID}\nartifact-ids=${result.artifactIds ?? ""}\nreason=${result.reason}\n`,
      )
      console.log(result.reason)
      break
    }
    case "verify":
      verifyArtifacts(
        args[0],
        args[1],
        process.env.RELEASE_SHA!,
        process.env.RELEASE_VERSION!,
        process.env.CI_RUN_ID!,
      )
      break
    case "manifest":
      writeFileSync(
        args[1],
        JSON.stringify(
          buildManifest(process.env.TAG!, regularFile(args[0]).toString()),
          null,
          2,
        ) + "\n",
      )
      break
    case "update-manifest":
      updateManifest(args[0], args[1])
      break
    case "verify-published":
      verifyPublished(args[0], process.env.TAG!)
      break
    default:
      throw new Error(`Unknown release artifacts command: ${command}`)
  }
}
