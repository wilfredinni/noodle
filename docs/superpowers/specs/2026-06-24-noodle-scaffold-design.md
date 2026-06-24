# Noodle Scaffold Design

> **Scope:** Scaffold only. No features. Produces a stubbed project skeleton with deps, configs, a non-functional app shell, and a smoke test. Feature work is deferred to separate plans.

## Goal

Stand up the `noodle` project — a terminal REST client built with OpenTUI (React binding), referenced against [Bruno](https://github.com/usebruno/bruno). The scaffold installs dependencies, wires configs, and lays down one `src/` folder per Bruno package concern, each containing typed interface stubs and throwing "not implemented" implementations. A minimal TUI app shell renders placeholder content. A smoke test asserts every stub throws as expected.

Nothing in the scaffold is functional beyond rendering the shell and exiting.

## Architecture

`noodle` is a single TypeScript package running on Bun with the OpenTUI React binding (`@opentui/react` + `@opentui/core` + `react`). Collections are stored on disk as YAML (one `.yml` per request, folders = collections); OpenAPI specs are an import source handled by a converter, not a storage format. The UI is a two-pane TUI shell: a request-list sidebar on the left, a request/response main pane on the right.

The scaffold mirrors Bruno's package decomposition as `src/` folders so Bruno's source transfers as a direct reference when features land:

| `src/` folder     | Bruno counterpart                  | Responsibility (stubbed)                              |
| ----------------- | ---------------------------------- | ----------------------------------------------------- |
| `app/`            | bruno-app entry                    | Renderer bootstrap, mount `<App>`, keymap wiring      |
| `ui/`             | bruno-app components               | React components: shell, sidebar, request/response    |
| `filestore/`      | bruno-filestore                    | Read/write collection dirs + `.yml` files from disk   |
| `lang/`           | bruno-lang                         | Parse/serialize YAML request/collection documents     |
| `schema/`         | bruno-schema + bruno-schema-types  | TS types: `Request`, `Collection`, `Response`, `Env`  |
| `requests/`       | bruno-requests                     | Execute an HTTP request from a `Request`              |
| `converters/`     | bruno-converters                   | Import OpenAPI spec → `Collection`                    |

## Tech Stack

- **Runtime:** Bun
- **UI:** OpenTUI React binding (`@opentui/react`, `@opentui/core`, `react`)
- **Storage format:** YAML via `js-yaml` (+ `@types/js-yaml`)
- **Language:** TypeScript (strict, `jsx: "react-jsx"`, `jsxImportSource: "@opentui/react"`, `moduleResolution: "bundler"`)
- **Tests:** `bun test` (Bun's built-in runner)
- **Lint/format:** ESLint flat config + Prettier

## File Structure

```
noodle/
├─ package.json
├─ tsconfig.json
├─ eslint.config.js
├─ .prettierrc.json
├─ .gitignore
├─ README.md
├─ src/
│  ├─ app/
│  │  ├─ index.tsx          # createCliRenderer + createRoot + <App> mount
│  │  └─ keymap.ts          # keybindings stub (leader/commands deferred)
│  ├─ ui/
│  │  ├─ index.ts           # re-exports
│  │  ├─ App.tsx            # shell layout (sidebar + main)
│  │  ├─ Sidebar.tsx        # request list placeholder
│  │  ├─ RequestPane.tsx    # request editor placeholder
│  │  └─ ResponsePane.tsx   # response viewer placeholder
│  ├─ filestore/
│  │  └─ index.ts           # loadCollection/saveRequest stubs + interface
│  ├─ lang/
│  │  └─ index.ts           # parse/serialize stubs
│  ├─ schema/
│  │  └─ index.ts           # Request/Collection/Response/Environment types
│  ├─ requests/
│  │  └─ index.ts           # sendRequest stub + interface
│  └─ converters/
│     └─ openapi.ts         # importOpenApi stub
├─ tests/
│  └─ smoke.test.ts         # stubs throw "not implemented"; entry loads
└─ docs/
```

## Stub Interfaces

Every module exports typed interfaces and throwing implementations. Types are real so the UI can wire against them; behavior throws `not implemented`. All stubs are replaced by feature plans later.

### `src/schema/index.ts` (types only)

```ts
export type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS"

export type Auth =
  | { type: "none" }
  | { type: "bearer"; token: string }
  | { type: "basic"; user: string; pass: string }

export interface Request {
  id: string
  name: string
  method: Method
  url: string
  headers: Record<string, string>
  params: Record<string, string>
  body?: string
  auth?: Auth
}

export interface Collection {
  id: string
  name: string
  requests: Request[]
}

export interface Response {
  status: number
  statusText: string
  headers: Record<string, string>
  body: string
  timeMs: number
}

export interface Environment {
  name: string
  vars: Record<string, string>
}
```

### `src/filestore/index.ts`

```ts
import type { Collection, Request } from "../schema"

export interface Filestore {
  loadCollection(dir: string): Promise<Collection>
  saveRequest(dir: string, req: Request): Promise<void>
}

export const filestore: Filestore = {
  async loadCollection() {
    throw new Error("filestore.loadCollection: not implemented")
  },
  async saveRequest() {
    throw new Error("filestore.saveRequest: not implemented")
  },
}
```

### `src/lang/index.ts`

```ts
import type { Collection, Request } from "../schema"

export interface Lang {
  parseRequest(yaml: string): Request
  serializeRequest(req: Request): string
  parseCollection(yaml: string): Collection
}

export const lang: Lang = {
  parseRequest() {
    throw new Error("lang.parseRequest: not implemented")
  },
  serializeRequest() {
    throw new Error("lang.serializeRequest: not implemented")
  },
  parseCollection() {
    throw new Error("lang.parseCollection: not implemented")
  },
}
```

### `src/requests/index.ts`

```ts
import type { Environment, Request, Response } from "../schema"

export interface RequestExecutor {
  send(req: Request, env?: Environment): Promise<Response>
}

export const executor: RequestExecutor = {
  async send() {
    throw new Error("requests.send: not implemented")
  },
}
```

### `src/converters/openapi.ts`

```ts
import type { Collection } from "../schema"

export interface OpenApiImporter {
  import(spec: string | object): Collection
}

export const openApiImporter: OpenApiImporter = {
  import() {
    throw new Error("converters.openapi.import: not implemented")
  },
}
```

## UI Shell

`<App>` renders a two-pane layout using OpenTUI JSX intrinsics (`<box>`, `<text>`, `<scrollbox>`). Components are presentational only — no state wiring to stubs. Props are typed against `schema` types but receive placeholder values.

```
┌─ noodle ─────────────────────────────────┐
│ ┌─ Requests ─┐ ┌─ Request ──────────────┐│
│ │ (empty)    │ │ GET  <url placeholder> ││
│ │            │ │                        ││
│ │            │ │ [Send]                 ││
│ ├────────────┤ ├─ Response ─────────────┤│
│ │            │ │ (no response yet)      ││
│ └────────────┘ └────────────────────────┘│
│ [Tab] focus · [Ctrl+C] quit              │
└──────────────────────────────────────────┘
```

- `App.tsx` — top-level flex row: `<Sidebar />` + a flex column with `<RequestPane />` and `<ResponsePane />`. Footer `<text>` shows keybind hints.
- `Sidebar.tsx` — bordered `<box>` titled "Requests", contains `<text>(empty)</text>`.
- `RequestPane.tsx` — bordered `<box>` titled "Request", shows a placeholder method + url `<text>` and a `[Send]` `<text>` (non-interactive in scaffold).
- `ResponsePane.tsx` — bordered `<box>` titled "Response", shows `<text>(no response yet)</text>`.

## Keymap

`src/app/keymap.ts` exports an empty `keymap` object stub. The scaffold wires only:

- `Ctrl+C` → exit (handled by `createCliRenderer({ exitOnCtrlC: true })`)
- `Tab` → focus cycle placeholder handler in `<App>` via `useKeyboard` (no-op beyond logging in the scaffold)

Leader keys, commands, and configurable bindings are deferred to a feature plan. The exact `@opentui/keymap` interface shape will be confirmed from `docs/keymap/overview.mdx` when writing the implementation plan.

## Tests

`tests/smoke.test.ts` using Bun's built-in runner:

```ts
import { describe, it, expect } from "bun:test"
import { filestore } from "../src/filestore"
import { lang } from "../src/lang"
import { executor } from "../src/requests"
import { openApiImporter } from "../src/converters/openapi"

describe("scaffold stubs", () => {
  it("filestore.loadCollection throws not-implemented", async () => {
    await expect(filestore.loadCollection(".")).rejects.toThrow("not implemented")
  })
  it("filestore.saveRequest throws not-implemented", async () => {
    await expect(filestore.saveRequest(".", {} as never)).rejects.toThrow("not implemented")
  })
  it("lang.parseRequest throws not-implemented", () => {
    expect(() => lang.parseRequest("")).toThrow("not implemented")
  })
  it("lang.serializeRequest throws not-implemented", () => {
    expect(() => lang.serializeRequest({} as never)).toThrow("not implemented")
  })
  it("lang.parseCollection throws not-implemented", () => {
    expect(() => lang.parseCollection("")).toThrow("not implemented")
  })
  it("executor.send throws not-implemented", async () => {
    await expect(executor.send({} as never)).rejects.toThrow("not implemented")
  })
  it("openApiImporter.import throws not-implemented", () => {
    expect(() => openApiImporter.import("")).toThrow("not implemented")
  })
})
```

No type-level test in the scaffold (deferred).

## Configs

### `package.json`

- `name`: `noodle`
- `type`: `module`
- `scripts`: `dev` (`bun run src/app/index.tsx`), `test` (`bun test`), `lint` (`eslint .`), `format` (`prettier --write .`)
- `dependencies`: `@opentui/core`, `@opentui/react`, `react`, `js-yaml`
- `devDependencies`: `@types/js-yaml`, `@types/react`, `typescript`, `eslint`, `prettier`

### `tsconfig.json`

From the OpenTUI React docs:

```json
{
  "compilerOptions": {
    "lib": ["ESNext", "DOM"],
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "jsxImportSource": "@opentui/react",
    "strict": true,
    "skipLibCheck": true
  }
}
```

### `eslint.config.js`

Flat config with TypeScript parser. React plugin **off** — OpenTUI JSX intrinsics are not DOM React, so rules like `react/react-in-jsx-scope` and `react/no-unknown-property` do not apply.

### `.prettierrc.json`

```json
{ "semi": false, "singleQuote": false }
```

Matches OpenTUI docs style (no semicolons, double quotes).

### `.gitignore`

`node_modules`, `dist`, `.bun`, OS junk (`.DS_Store`).

## Out of Scope (deferred to feature plans)

- YAML parsing/serialization logic (`lang`)
- Disk I/O for collections (`filestore`)
- HTTP request execution (`requests`)
- OpenAPI spec parsing (`converters`)
- UI state management / wiring stubs to components
- Persistence and collection CRUD UI
- Environment variable substitution
- Auth execution (bearer/basic/etc.)
- Request body editor
- Response syntax highlighting / formatting
- Keymap commands, leader keys, configurable bindings
- Plugin system
- CLI runner (à la `bru run`)
- Tests beyond the smoke test

## Verification

Scaffold is complete when:

1. `bun install` succeeds with no peer-dep errors.
2. `bun run dev` renders the app shell (sidebar + request pane + response pane + footer hints).
3. `Ctrl+C` exits cleanly.
4. `bun test` passes — all stubs throw "not implemented".
5. `bun run lint` and `bun run format` run clean.
