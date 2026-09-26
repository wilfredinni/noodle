import javascriptWasm from "../../lang/parsers/javascript/tree-sitter-javascript.wasm" with { type: "file" }
import javascriptHighlights from "../../lang/parsers/javascript/highlights.scm" with { type: "file" }
import jsonWasm from "../../lang/parsers/json/tree-sitter-json.wasm" with { type: "file" }
import jsonHighlights from "../../lang/parsers/json/highlights.scm" with { type: "file" }
import yamlWasm from "../../lang/parsers/yaml/tree-sitter-yaml.wasm" with { type: "file" }
import yamlHighlights from "../../lang/parsers/yaml/highlights.scm" with { type: "file" }
import xmlWasm from "../../lang/parsers/xml/tree-sitter-xml.wasm" with { type: "file" }
import xmlHighlights from "../../lang/parsers/xml/highlights.scm" with { type: "file" }
import type { FiletypeParserOptions } from "@opentui/core"

export const codeEditorParsers: FiletypeParserOptions[] = [
  {
    filetype: "javascript",
    wasm: javascriptWasm,
    queries: { highlights: [javascriptHighlights] },
  },
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
  {
    filetype: "xml",
    wasm: xmlWasm,
    queries: {
      highlights: [xmlHighlights],
    },
  },
]
