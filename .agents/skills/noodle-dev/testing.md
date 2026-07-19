# Testing

## Runner

`bun test` (NOT jest/vitest). Uses `describe`, `it`, `expect` from `bun:test`.

```bash
bun test                                    # all ~1180 tests
bun test tests/lang.test.ts                 # single file
bun test --test-name-pattern "parseFolder"  # by name
```

## Directory structure

```
tests/
├── *.test.ts            ← Top-level integration/feature tests
├── unit/                ← Pure function tests (no rendering)
│   └── _helpers.tsx     ← setupKeymap() test utility
├── integration/         ← Interaction tests (keymap layers, components)
└── fixtures/            ← Test data (JSON files, sample YAML)
```

## Common patterns

### Factory functions for test data
```ts
// Found across test files — create minimal valid objects
function makeReq(overrides?: Partial<Request>): Request
function makeFolder(overrides?: Partial<Folder>): Folder
function makeRes(overrides?: Partial<Response>): Response
```

### Temp directories for file I/O tests
```ts
import { mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"

let dir: string
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), "test-")) })
afterEach(async () => { await rm(dir, { recursive: true }) })
```

### Error assertions
```ts
expect(() => parseRequest("id", badYaml)).toThrow("lang.parseRequest:")
```

### Keymap testing (with `createTestKeymap`)
```ts
import { createTestKeymap } from "@opentui/keymap/testing"
// See tests/unit/_helpers.tsx for setupKeymap() helper
const { keymap, host } = createTestKeymap()
// Register layers, then:
host.press("ctrl+s")
expect(saveHandler).toHaveBeenCalled()
```

### Modal keyboard-isolation testing
```ts
const backgroundKeys: string[] = []
keymap.intercept("key", (ctx) => {
  backgroundKeys.push(ctx.event.name)
}, { priority: 0 })

host.press("i") // overlay shortcut
host.press("e") // unused printable key
expect(backgroundKeys).toEqual([])
```

Mount the visible overlay before pressing keys. Its shield should have higher priority than background handlers; non-editable overlays call both `preventDefault()` and `stopPropagation()`, while editable overlays call `stopPropagation()` without preventing the focused input’s default behavior.

## Where to put tests

| What changed | Test file |
|-------------|-----------|
| YAML parse/serialize | `tests/lang.test.ts` |
| File I/O (filestore) | `tests/filestore.test.ts` |
| Environment load/save | `tests/env*.test.ts` |
| HTTP execution, substitution | `tests/requests.test.ts` |
| Folder overrides | `tests/unit/mergeFolderOverrides.test.ts` |
| Pure helper function | `tests/unit/<name>.test.ts` |
| UI component rendering | `tests/<ComponentName>.test.tsx` |
| Variable completion | `tests/unit/variableCompletion.test.ts`, `tests/unit/UrlBar.test.tsx` |
| Code Editor | `tests/unit/CodeEditor.test.tsx`, `tests/unit/highlightOffsets.test.ts`, `tests/unit/variableHighlight.test.tsx` |
| Code Editor completion | `tests/unit/CodeEditorCompletion.test.tsx` |
| Command palette | `tests/unit/commands.test.ts`, `tests/unit/CommandPaletteOverlay.test.tsx` |
| Collection switcher | `tests/unit/CollectionSwitcherOverlay.test.tsx` |
| JSON body viewer / validation | `tests/JsonBodyViewer.test.tsx`, `tests/unit/jsonValidation.test.ts` |
| Clipboard | `tests/unit/clipboard.test.ts` |
| Keymap/keybindings | `tests/integration/keymap.test.ts` |
| State/hook logic | `tests/unit/<hookName>.test.ts` |

### Factory functions
```ts
// Common across test files — create minimal valid objects
function makeReq(overrides?: Partial<Request>): Request
function makeFolder(overrides?: Partial<Folder>): Folder
function makeRes(overrides?: Partial<Response>): Response
function makeParamEntry(name: string, value: string): ParamEntry
function makeFormEntry(name: string, value: string, type?: "text" | "file"): FormEntry
function makeTimelineEntry(overrides?: Partial<TimelineEntry>): TimelineEntry
```

## Test conventions

- **No external services** — tests are self-contained
- **Exact error message matching** — use full expected string in `.toThrow()`
- **Round-trip testing** — parse then serialize, expect input ≈ output
- **Edge case coverage** — empty/null/undefined inputs, unknown keys, invalid types
- **Cleanup** — `afterEach` removes temp dirs; no leaked state between tests
- **Naming** — `it("should parse basic auth headers from YAML")` — descriptive, starts with "should"
