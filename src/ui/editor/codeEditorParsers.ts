import jsonWasm from "../../lang/parsers/json/tree-sitter-json.wasm" with { type: "file" }
import jsonHighlights from "../../lang/parsers/json/highlights.scm" with { type: "file" }
import yamlWasm from "../../lang/parsers/yaml/tree-sitter-yaml.wasm" with { type: "file" }
import yamlHighlights from "../../lang/parsers/yaml/highlights.scm" with { type: "file" }
import type { FiletypeParserOptions } from "@opentui/core"

export const codeEditorParsers: FiletypeParserOptions[] = [
  {
    filetype: "json",
    wasm: jsonWasm,
    queries: {
      highlights: [jsonHighlights],
    },
  },
  {
    filetype: "yaml",
    wasm: yamlWasm,
    queries: {
      highlights: [yamlHighlights],
    },
  },
]
