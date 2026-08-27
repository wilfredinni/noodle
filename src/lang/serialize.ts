import * as yaml from "../yaml"
import type { Request } from "../schema"
import { authToObj } from "./auth"

function yamlVal(val: string, indent = 0): string {
  const dumped = yaml.dump(val, { lineWidth: -1 }).trim()
  if (indent === 0 || !dumped.includes("\n")) {
    return dumped
  }
  const lines = dumped.split("\n")
  const pad = " ".repeat(indent)
  return [lines[0], ...lines.slice(1).map((l) => pad + l)].join("\n")
}

export function serializeRequest(req: Request): string {
  let out = ""

  out += `name: ${yamlVal(req.name)}\n`
  out += `method: ${yamlVal(req.method)}\n`
  out += `url: ${yamlVal(req.url)}\n`
  out += `timeout: ${String(req.timeout)}\n`
  if (req.tags?.length) {
    out += yaml.dump({ tags: req.tags }, { lineWidth: -1, noRefs: true })
  }
  out += `followRedirects: ${req.followRedirects ?? true}\n`
  out += `maxRedirects: ${req.maxRedirects ?? 5}\n`
  if (req.sendCookies !== undefined) {
    out += `sendCookies: ${req.sendCookies}\n`
  }

  if (req.tls?.verify !== undefined) {
    out += "tls:\n"
    out += `  verify: ${req.tls.verify}\n`
  }

  if (Object.keys(req.headers).length > 0) {
    out += "headers:\n"
    for (const [k, v] of Object.entries(req.headers)) {
      const val = yamlVal(v.value, 2)
      if (v.enabled) {
        out += `  ${k}: ${val}\n`
      } else {
        out += `  ${k}: { value: ${val}, enabled: false }\n`
      }
    }
  }

  if (req.params.length > 0) {
    out += "params:\n"
    for (const entry of req.params) {
      const nameVal = yamlVal(entry.name, 4)
      const valVal = yamlVal(entry.value, 4)
      if (entry.enabled) {
        out += `  - name: ${nameVal}\n    value: ${valVal}\n`
      } else {
        out += `  - name: ${nameVal}\n    value: ${valVal}\n    enabled: ${entry.enabled}\n`
      }
    }
  }

  if (req.pathParams && req.pathParams.length > 0) {
    out += "path_params:\n"
    for (const entry of req.pathParams) {
      const nameVal = yamlVal(entry.name, 4)
      const valVal = yamlVal(entry.value, 4)
      out += `  - name: ${nameVal}\n    value: ${valVal}\n`
    }
  }

  if (req.body !== undefined) {
    out += `body: ${yamlVal(req.body)}\n`
  }

  if (req.bodyType !== undefined) {
    out += `body_type: ${yamlVal(req.bodyType)}\n`
  }

  if (req.formData !== undefined && req.formData.length > 0) {
    out += "form_data:\n"
    for (const entry of req.formData) {
      const nameVal = yamlVal(entry.name, 4)
      const valVal = yamlVal(entry.value, 4)
      if (entry.enabled && entry.type === "text") {
        out += `  - name: ${nameVal}\n    value: ${valVal}\n`
      } else {
        out += `  - name: ${nameVal}\n    value: ${valVal}\n    enabled: ${entry.enabled}\n    type: ${entry.type}\n`
      }
    }
  }

  if (req.filePath !== undefined) {
    out += `file_path: ${yamlVal(req.filePath)}\n`
  }

  if (req.captures && Object.keys(req.captures).length > 0) {
    out += yaml.dump({ capture: req.captures }, { lineWidth: -1, noRefs: true })
  }

  if (req.assertions && req.assertions.length > 0) {
    out += yaml.dump(
      {
        assert: req.assertions.map((assertion) => ({ ...assertion })),
      },
      { lineWidth: -1, noRefs: true },
    )
  }

  if (req.auth && req.auth.type !== "none") {
    out += yaml.dump(
      { auth: authToObj(req.auth) },
      { lineWidth: -1, noRefs: true },
    )
  }

  return out
}
