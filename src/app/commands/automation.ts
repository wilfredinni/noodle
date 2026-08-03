import { defineCommand } from "citty"
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
  formatEnvironmentSet,
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
  environmentSet,
  requestCreate,
  requestRun,
  workspaceAudit,
  workspaceList,
} from "../services"
import type { Method } from "../../schema"

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
      meta: { name: "run", description: "Run every request in a collection" },
      args: {
        path: { type: "positional", required: true },
        env: { type: "string", alias: "e" },
        json: jsonArg,
      },
      run: ({ args }) =>
        emitCommand(
          args.json,
          async () => {
            const progress = args.json ? undefined : createRunProgressReporter()
            try {
              const data = await collectionRun(
                args.path,
                args.env,
                progress?.update,
              )
              return { data, failed: data.failed }
            } finally {
              progress?.finish()
            }
          },
          formatCollectionRun,
        ),
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
export { workspace, collection, request, environment }
