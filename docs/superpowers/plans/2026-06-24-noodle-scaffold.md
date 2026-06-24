# Noodle Scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the `noodle` terminal REST client — deps installed, configs wired, module stubs in place, app shell rendering, smoke test passing. No functional behavior.

**Architecture:** Single Bun/TypeScript package with OpenTUI React binding. `src/` folder per Bruno package concern (schema, filestore, lang, requests, converters, ui, app). Each module exports typed interfaces + throwing "not implemented" stubs. App renders a two-pane TUI shell with placeholder content.

**Tech Stack:** Bun, TypeScript, `@opentui/core`, `@opentui/react`, `react`, `js-yaml`, bun:test, ESLint (flat config), Prettier.

---

### Task 1: Write package.json and install dependencies

**Files:**
- Create: `package.json`

- [ ] **Step 1: Write package.json**

```json
{
  "name": "noodle",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "scripts": {
    "dev": "bun run src/app/index.tsx",
    "test": "bun test",
    "lint": "eslint .",
    "format": "prettier --write ."
  }
}
```

- [ ] **Step 2: Install runtime dependencies**

Run: `bun add @opentui/core @opentui/react react js-yaml`
Expected: Adds 4 dependencies to package.json. No peer-dep warnings.

- [ ] **Step 3: Install dev dependencies**

Run: `bun add -d typescript @types/react @types/js-yaml eslint @eslint/js typescript-eslint prettier`
Expected: Adds 7 devDependencies to package.json. No peer-dep warnings.

- [ ] **Step 4: Verify node_modules exists**

Run: `ls node_modules/@opentui/core | head -1`
Expected: Directory listing (package installed).

---

### Task 2: Write TypeScript configuration

**Files:**
- Create: `tsconfig.json`
- Modify: `package.json` (bun init may create a tsconfig — if it exists, overwrite it)

- [ ] **Step 1: Write tsconfig.json**

From the OpenTUI React docs (`docs/bindings/react.mdx:45-58`):

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

- [ ] **Step 2: Verify TS parses the config**

Run: `bun run --silent tsc --noEmit 2>&1 || true`
Expected: No parse errors for tsconfig itself (source files don't exist yet, expect "no inputs" or other file-not-found errors).

---

### Task 3: Write ESLint and Prettier configs

**Files:**
- Create: `eslint.config.js`
- Create: `.prettierrc.json`

- [ ] **Step 1: Write eslint.config.js**

```js
import eslint from "@eslint/js"
import tseslint from "typescript-eslint"

export default tseslint.config(
  { ignores: ["node_modules/", "dist/", ".bun/"] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
)
```

- [ ] **Step 2: Write .prettierrc.json**

```json
{ "semi": false, "singleQuote": false }
```

- [ ] **Step 3: Verify ESLint config loads**

Run: `bun run eslint --help | head -1`
Expected: Prints ESLint help banner (no parse errors).

- [ ] **Step 4: Verify Prettier config loads**

Run: `bun run prettier --version`
Expected: Prints Prettier version.

---

### Task 4: Write .gitignore

**Files:**
- Create: `.gitignore`

- [ ] **Step 1: Write .gitignore**

```
node_modules/
dist/
.bun/
.DS_Store
```

- [ ] **Step 2: Verify git ignores node_modules**

Run: `git status --short`
Expected: Does NOT show `node_modules/` as untracked (should already be ignored via `.gitignore`).

---

### Task 5: Write schema types (src/schema/index.ts)

**Files:**
- Create: `src/schema/index.ts`

- [ ] **Step 1: Create directory**

Run: `mkdir -p src/schema`

- [ ] **Step 2: Write src/schema/index.ts**

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

- [ ] **Step 3: Verify types compile**

Run: `bun run --silent tsc --noEmit 2>&1`
Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add package.json tsconfig.json eslint.config.js .prettierrc.json .gitignore src/schema/index.ts
git commit -m "feat: project init, configs, schema types"
```

---

### Task 6: Write filestore stub (src/filestore/index.ts)

**Files:**
- Create: `src/filestore/index.ts`

- [ ] **Step 1: Create directory**

Run: `mkdir -p src/filestore`

- [ ] **Step 2: Write src/filestore/index.ts**

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

- [ ] **Step 3: Verify compiles**

Run: `bun run --silent tsc --noEmit 2>&1`
Expected: No type errors.

---

### Task 7: Write lang stub (src/lang/index.ts)

**Files:**
- Create: `src/lang/index.ts`

- [ ] **Step 1: Create directory**

Run: `mkdir -p src/lang`

- [ ] **Step 2: Write src/lang/index.ts**

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

- [ ] **Step 3: Verify compiles**

Run: `bun run --silent tsc --noEmit 2>&1`
Expected: No type errors.

---

### Task 8: Write requests stub (src/requests/index.ts)

**Files:**
- Create: `src/requests/index.ts`

- [ ] **Step 1: Create directory**

Run: `mkdir -p src/requests`

- [ ] **Step 2: Write src/requests/index.ts**

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

- [ ] **Step 3: Verify compiles**

Run: `bun run --silent tsc --noEmit 2>&1`
Expected: No type errors.

---

### Task 9: Write converters stub (src/converters/openapi.ts)

**Files:**
- Create: `src/converters/openapi.ts`

- [ ] **Step 1: Create directory**

Run: `mkdir -p src/converters`

- [ ] **Step 2: Write src/converters/openapi.ts**

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

- [ ] **Step 3: Verify compiles**

Run: `bun run --silent tsc --noEmit 2>&1`
Expected: No type errors.

---

### Task 10: Write smoke test

**Files:**
- Create: `tests/smoke.test.ts`

- [ ] **Step 1: Create directory**

Run: `mkdir -p tests`

- [ ] **Step 2: Write tests/smoke.test.ts**

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

- [ ] **Step 3: Run smoke test — expect all pass**

Run: `bun test`
Expected: 7 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/filestore src/lang src/requests src/converters tests
git commit -m "feat: module stubs + smoke test"
```

---

### Task 11: Write UI components — Sidebar, RequestPane, ResponsePane

**Files:**
- Create: `src/ui/Sidebar.tsx`
- Create: `src/ui/RequestPane.tsx`
- Create: `src/ui/ResponsePane.tsx`
- Create: `src/ui/index.ts`

- [ ] **Step 1: Create directory**

Run: `mkdir -p src/ui`

- [ ] **Step 2: Write src/ui/Sidebar.tsx**

```tsx
export function Sidebar() {
  return (
    <box style={{ border: true, width: 25, flexDirection: "column" }} title="Requests">
      <text fg="#888">(empty)</text>
    </box>
  )
}
```

- [ ] **Step 3: Write src/ui/RequestPane.tsx**

```tsx
export function RequestPane() {
  return (
    <box
      style={{ border: true, flexGrow: 1, flexDirection: "column", padding: 1, gap: 1 }}
      title="Request"
    >
      <text>GET  https://httpbin.org/get</text>
      <text fg="#888">[Send]</text>
    </box>
  )
}
```

- [ ] **Step 4: Write src/ui/ResponsePane.tsx**

```tsx
export function ResponsePane() {
  return (
    <box
      style={{ border: true, flexGrow: 1, flexDirection: "column", padding: 1 }}
      title="Response"
    >
      <text fg="#888">(no response yet)</text>
    </box>
  )
}
```

- [ ] **Step 5: Write src/ui/index.ts**

```ts
export { Sidebar } from "./Sidebar"
export { RequestPane } from "./RequestPane"
export { ResponsePane } from "./ResponsePane"
```

- [ ] **Step 6: Verify compiles**

Run: `bun run --silent tsc --noEmit 2>&1`
Expected: No type errors.

---

### Task 12: Write App shell component

**Files:**
- Create: `src/ui/App.tsx`
- Modify: `src/ui/index.ts` (add App export)

- [ ] **Step 1: Write src/ui/App.tsx**

```tsx
import { useKeyboard } from "@opentui/react"
import { Sidebar } from "./Sidebar"
import { RequestPane } from "./RequestPane"
import { ResponsePane } from "./ResponsePane"

export function App() {
  useKeyboard((key) => {
    if (key.name === "tab") {
      // focus cycle placeholder
    }
  })

  return (
    <box
      style={{ flexDirection: "column", width: "100%", height: "100%", border: true }}
    >
      <box style={{ flexDirection: "row", flexGrow: 1 }}>
        <Sidebar />
        <box style={{ flexDirection: "column", flexGrow: 1 }}>
          <RequestPane />
          <ResponsePane />
        </box>
      </box>
      <text fg="#666">[Tab] focus · [Ctrl+C] quit</text>
    </box>
  )
}
```

- [ ] **Step 2: Update src/ui/index.ts — add App export**

Replace the content with:

```ts
export { App } from "./App"
export { Sidebar } from "./Sidebar"
export { RequestPane } from "./RequestPane"
export { ResponsePane } from "./ResponsePane"
```

- [ ] **Step 3: Verify compiles**

Run: `bun run --silent tsc --noEmit 2>&1`
Expected: No type errors.

---

### Task 13: Write app entry point and keymap stub

**Files:**
- Create: `src/app/index.tsx`
- Create: `src/app/keymap.ts`

- [ ] **Step 1: Create directory**

Run: `mkdir -p src/app`

- [ ] **Step 2: Write src/app/keymap.ts**

```ts
// keymap placeholder — real keymap deferred to feature plan
export const keymapBindings: Record<string, never> = {}
```

- [ ] **Step 3: Write src/app/index.tsx**

```tsx
import { createCliRenderer } from "@opentui/core"
import { createRoot } from "@opentui/react"
import { App } from "../ui/App"

const renderer = await createCliRenderer({ exitOnCtrlC: true })
createRoot(renderer).render(<App />)
```

- [ ] **Step 4: Verify compiles**

Run: `bun run --silent tsc --noEmit 2>&1`
Expected: No type errors.

---

### Task 14: Verify end-to-end

- [ ] **Step 1: Run the app — verify shell renders**

Run: `timeout 2 bun run dev 2>&1 || true`
Expected: Terminal clears, renders the app shell with sidebar + request pane + response pane + footer hints. Exits cleanly after 2 seconds or on `Ctrl+C`.

- [ ] **Step 2: Run smoke test**

Run: `bun test`
Expected: All 7 tests pass.

- [ ] **Step 3: Run lint**

Run: `bun run lint`
Expected: 0 errors, 0 warnings.

- [ ] **Step 4: Run format check**

Run: `bunx prettier --check .`
Expected: "All matched files use Prettier code style!" (or no output = clean).

- [ ] **Step 5: Final type check**

Run: `bun run --silent tsc --noEmit 2>&1`
Expected: No output (clean).

- [ ] **Step 6: Verify git status shows only intended files**

Run: `git status --short`
Expected: Shows `src/app/` and `src/ui/` as untracked (the files not yet committed). No `node_modules/` or `.bun/` or `.DS_Store`.

- [ ] **Step 7: Commit**

```bash
git add src/app src/ui
git commit -m "feat: app entry, UI shell components"
```

---

## Verification Checklist

After all tasks complete, confirm:

1. `bun install` — clean, no peer-dep warnings
2. `bun test` — 7 passing, 0 failing
3. `bun run lint` — 0 errors, 0 warnings
4. `bunx prettier --check .` — all files formatted
5. `bun run --silent tsc --noEmit` — no type errors
6. `bun run dev` — renders the app shell, `Ctrl+C` exits
7. `git status` — clean working tree
8. `git log --oneline -3` — shows 3 commits: configs+schema, stubs+test, app+ui
