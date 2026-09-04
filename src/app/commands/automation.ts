import { defineCommand } from "citty"
import { parseArgs } from "node:util"
import { emitCommand } from "../commandResult"
import {
  createRunProgressReporter,
  formatCollectionAudit,
  formatCollectionCreate,
  formatCollectionFormat,
  formatCollectionInspect,
  formatCollectionInit,
  formatCollectionList,
  formatCollectionRun,
  formatCookieClear,
  formatCookieList,
  formatEnvironmentSet,
  formatSecretDelete,
  formatSecretList,
  formatSecretSet,
  formatRequestCreate,
  formatRequestRun,
  formatWorkspaceAudit,
  formatWorkspaceList,
} from "../humanOutput"
import {
  collectionAudit,
  collectionCreate,
  collectionFormat,
  collectionInit,
  collectionInspect,
  collectionList,
  collectionRun,
  cookieClear,
  cookieList,
  environmentSet,
  secretDelete,
  secretList,
  secretSet,
  requestCreate,
  requestRun,
  workspaceAudit,
  workspaceList,
} from "../services"
import type { Method } from "../../schema"
import { takeSystemProxyFromEnv } from "../../proxy"

const jsonArg = {
  type: "boolean" as const,
  default: false,
  description: "Write one JSON result envelope to stdout",
}
const collectionArg = {
  type: "string" as const,
  default: "./collections",
  description: "Collection directory",
}
const methods: Method[] = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
]

async function readSecretInput(fromStdin: boolean): Promise<string> {
  if (fromStdin) {
    const value = await Bun.stdin.text()
    return value.replace(/\r?\n$/, "")
  }
  if (!process.stdin.isTTY || !process.stderr.isTTY) {
    throw new Error("secret input requires a TTY; use --stdin for automation")
  }
  process.stderr.write("Secret value: ")
  return new Promise((resolve, reject) => {
    const input = process.stdin
    const wasRaw = input.isRaw
    let value = ""
    const cleanup = () => {
      input.off("data", onData)
      input.setRawMode?.(Boolean(wasRaw))
      input.pause()
    }
    const onData = (chunk: Buffer | string) => {
      const text = chunk.toString()
      for (const char of text) {
        if (char === "\u0003") {
          cleanup()
          process.stderr.write("\n")
          reject(new Error("secret input cancelled"))
          return
        }
        if (char === "\r" || char === "\n") {
          cleanup()
          process.stderr.write("\n")
          resolve(value)
          return
        }
        if (char === "\u007f" || char === "\b") {
          if (value) {
            value = [...value].slice(0, -1).join("")
            process.stderr.write("\b \b")
          }
          continue
        }
        if (char >= " ") {
          value += char
          process.stderr.write("•")
        }
      }
    }
    input.setRawMode?.(true)
    input.resume()
    input.on("data", onData)
  })
}

const workspace = defineCommand({
  meta: { name: "workspace", description: "Manage registered collections" },
  subCommands: {
    list: defineCommand({
      meta: { name: "list", description: "List registered collections" },
      args: { json: jsonArg },
      run: ({ args }) =>
        emitCommand(
          args.json,
          async () => ({ data: await workspaceList() }),
          formatWorkspaceList,
        ),
    }),
    audit: defineCommand({
      meta: { name: "audit", description: "Validate registered collections" },
      args: { fix: { type: "boolean", default: false }, json: jsonArg },
      run: ({ args }) =>
        emitCommand(
          args.json,
          async () => {
            const data = await workspaceAudit(args.fix)
            return { data, failed: !data.valid }
          },
          formatWorkspaceAudit,
        ),
    }),
  },
})
const collection = defineCommand({
  meta: {
    name: "collection",
    description: "Create, inspect, audit, and run collections",
  },
  subCommands: {
    create: defineCommand({
      meta: {
        name: "create",
        description: "Create and register a starter collection",
      },
      args: {
        name: { type: "positional", required: true },
        output: { type: "string", alias: "o", default: "." },
        json: jsonArg,
      },
      run: ({ args }) =>
        emitCommand(
          args.json,
          async () => ({
            data: await collectionCreate(args.name, args.output),
          }),
          formatCollectionCreate,
        ),
    }),
    init: defineCommand({
      meta: {
        name: "init",
        description: "Initialize an existing directory as a collection",
      },
      args: {
        path: { type: "positional", required: true },
        json: jsonArg,
      },
      run: ({ args }) =>
        emitCommand(
          args.json,
          async () => ({ data: await collectionInit(args.path) }),
          formatCollectionInit,
        ),
    }),
    list: defineCommand({
      meta: { name: "list", description: "Print a collection tree" },
      args: { path: { type: "positional", required: true }, json: jsonArg },
      run: ({ args }) =>
        emitCommand(
          args.json,
          async () => ({
            data: await collectionList(args.path),
          }),
          formatCollectionList,
        ),
    }),
    inspect: defineCommand({
      meta: { name: "inspect", description: "Inspect a collection" },
      args: { path: { type: "positional", required: true }, json: jsonArg },
      run: ({ args }) =>
        emitCommand(
          args.json,
          async () => ({
            data: await collectionInspect(args.path),
          }),
          formatCollectionInspect,
        ),
    }),
    format: defineCommand({
      meta: {
        name: "format",
        description: "Canonicalize request YAML and pretty-print JSON bodies",
      },
      args: { path: { type: "positional", required: true }, json: jsonArg },
      run: ({ args }) =>
        emitCommand(
          args.json,
          async () => ({ data: await collectionFormat(args.path) }),
          formatCollectionFormat,
        ),
    }),
    audit: defineCommand({
      meta: { name: "audit", description: "Validate all collection files" },
      args: {
        path: { type: "positional", required: true },
        fix: { type: "boolean", default: false },
        json: jsonArg,
      },
      run: ({ args }) =>
        emitCommand(
          args.json,
          async () => {
            const data = await collectionAudit(args.path, args.fix)
            return { data, failed: !data.valid }
          },
          formatCollectionAudit,
        ),
    }),
    run: defineCommand({
      meta: {
        name: "run",
        description: "Run selected requests or every request in a collection",
      },
      args: {
        path: { type: "positional", required: true },
        "targets...": {
          type: "positional",
          required: false,
          description: "Request IDs or folder paths ending in /",
        },
        env: { type: "string", alias: "e" },
        tag: {
          type: "string",
          description: "Require this tag (repeatable; all must match)",
        },
        "exclude-tag": {
          type: "string",
          description: "Exclude this tag (repeatable; any match excludes)",
        },
        "fail-fast": {
          type: "boolean",
          default: false,
          description: "Stop after the first failed request",
        },
        delay: {
          type: "string",
          default: "0",
          description: "Milliseconds to wait between requests",
        },
        noproxy: { type: "boolean", default: false },
        insecure: { type: "boolean", default: false },
        json: jsonArg,
      },
      run: ({ args, rawArgs }) => {
        const { values } = parseArgs({
          args: rawArgs,
          options: {
            tag: { type: "string", multiple: true },
            "exclude-tag": { type: "string", multiple: true },
          },
          allowPositionals: true,
          strict: false,
        })
        return emitCommand(
          args.json,
          async () => {
            const progress = args.json ? undefined : createRunProgressReporter()
            try {
              const data = await collectionRun(
                args.path,
                args.env,
                progress?.update,
                args.noproxy,
                takeSystemProxyFromEnv(),
                args.insecure,
                args._.slice(1),
                (values.tag ?? []) as string[],
                (values["exclude-tag"] ?? []) as string[],
                args["fail-fast"],
                undefined,
                args.delay.trim() === "" ? Number.NaN : Number(args.delay),
              )
              return {
                data,
                failed: data.failed,
                ...(data.failure
                  ? {
                      errors: [data.failure.message],
                      exitCode: 2,
                    }
                  : {}),
              }
            } finally {
              progress?.finish()
            }
          },
          formatCollectionRun,
        )
      },
    }),
  },
})
const request = defineCommand({
  meta: { name: "request", description: "Create and run requests" },
  subCommands: {
    create: defineCommand({
      meta: { name: "create", description: "Create a request" },
      args: {
        id: { type: "positional", required: true },
        url: { type: "string", required: true },
        method: { type: "string", default: "GET" },
        collection: collectionArg,
        json: jsonArg,
      },
      run: ({ args }) =>
        emitCommand(
          args.json,
          async () => {
            if (!methods.includes(args.method as Method))
              throw new Error(`invalid HTTP method "${args.method}"`)
            return {
              data: await requestCreate(
                args.id,
                args.url,
                args.method as Method,
                args.collection,
              ),
            }
          },
          formatRequestCreate,
        ),
    }),
    run: defineCommand({
      meta: { name: "run", description: "Run one request" },
      args: {
        id: { type: "positional", required: true },
        collection: collectionArg,
        env: { type: "string", alias: "e" },
        noproxy: { type: "boolean", default: false },
        insecure: { type: "boolean", default: false },
        json: jsonArg,
      },
      run: ({ args }) =>
        emitCommand(
          args.json,
          async () => {
            const progress = args.json ? undefined : createRunProgressReporter()
            try {
              const data = await requestRun(
                args.id,
                args.collection,
                args.env,
                progress?.update,
                args.noproxy,
                takeSystemProxyFromEnv(),
                args.insecure,
              )
              return { data, failed: data.failed }
            } finally {
              progress?.finish()
            }
          },
          formatRequestRun,
        ),
    }),
  },
})
const environment = defineCommand({
  meta: { name: "environment", description: "Manage environment variables" },
  subCommands: {
    set: defineCommand({
      meta: { name: "set", description: "Set an environment variable" },
      args: {
        key: { type: "positional", required: true },
        value: { type: "positional", required: true },
        env: { type: "string", required: true },
        collection: collectionArg,
        json: jsonArg,
      },
      run: ({ args }) =>
        emitCommand(
          args.json,
          async () => ({
            data: await environmentSet(
              args.key,
              args.value,
              args.env,
              args.collection,
            ),
          }),
          formatEnvironmentSet,
        ),
    }),
  },
})
const secret = defineCommand({
  meta: { name: "secret", description: "Manage secure environment values" },
  subCommands: {
    set: defineCommand({
      meta: { name: "set", description: "Store or replace a secret value" },
      args: {
        key: { type: "positional", required: true },
        env: { type: "string", required: true },
        collection: collectionArg,
        stdin: {
          type: "boolean",
          default: false,
          description: "Read the secret value from stdin",
        },
        json: jsonArg,
      },
      run: ({ args }) =>
        emitCommand(
          args.json,
          async () => ({
            data: await secretSet(
              args.key,
              await readSecretInput(args.stdin),
              args.env,
              args.collection,
            ),
          }),
          formatSecretSet,
        ),
    }),
    list: defineCommand({
      meta: { name: "list", description: "List secret names and status" },
      args: {
        env: { type: "string", required: true },
        collection: collectionArg,
        json: jsonArg,
      },
      run: ({ args }) =>
        emitCommand(
          args.json,
          async () => ({ data: await secretList(args.env, args.collection) }),
          formatSecretList,
        ),
    }),
    delete: defineCommand({
      meta: { name: "delete", description: "Remove a local secret value" },
      args: {
        key: { type: "positional", required: true },
        env: { type: "string", required: true },
        collection: collectionArg,
        json: jsonArg,
      },
      run: ({ args }) =>
        emitCommand(
          args.json,
          async () => ({
            data: await secretDelete(args.key, args.env, args.collection),
          }),
          formatSecretDelete,
        ),
    }),
  },
})

const cookie = defineCommand({
  meta: {
    name: "cookie",
    description: "Inspect and clear the collection cookie jar",
  },
  subCommands: {
    list: defineCommand({
      meta: { name: "list", description: "Print every cookie in the jar" },
      args: { collection: collectionArg, json: jsonArg },
      run: ({ args }) =>
        emitCommand(
          args.json,
          async () => ({ data: await cookieList(args.collection) }),
          formatCookieList,
        ),
    }),
    clear: defineCommand({
      meta: { name: "clear", description: "Remove every cookie from the jar" },
      args: { collection: collectionArg, json: jsonArg },
      run: ({ args }) =>
        emitCommand(
          args.json,
          async () => ({ data: await cookieClear(args.collection) }),
          formatCookieClear,
        ),
    }),
  },
})
export { workspace, collection, request, environment, secret, cookie }
