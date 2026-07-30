import yaml from "js-yaml"
import type { Auth, Request } from "../schema"

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
  out += `followRedirects: ${req.followRedirects ?? true}\n`
  out += `maxRedirects: ${req.maxRedirects ?? 5}\n`

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

  if (req.auth && req.auth.type !== "none") {
    const authObj = authToObj(req.auth)
    out += "auth:\n"
    for (const [k, v] of Object.entries(authObj)) {
      const dumped = yaml.dump(v, { lineWidth: -1 }).trim()
      const valFormatted = dumped.includes("\n")
        ? dumped
            .split("\n")
            .map((line, idx) => (idx === 0 ? line : `  ${line}`))
            .join("\n")
        : dumped
      out += `  ${k}: ${valFormatted}\n`
    }
  }

  return out
}

function authToObj(auth: Auth): Record<string, unknown> {
  if (auth.type === "none") return { type: "none" }
  if (auth.type === "inherit") return { type: "inherit" }
  if (auth.type === "bearer") return { type: "bearer", token: auth.token }
  if (auth.type === "basic")
    return { type: "basic", user: auth.user, pass: auth.pass }
  if (auth.type === "api_key")
    return {
      type: "api_key",
      key: auth.key,
      value: auth.value,
      placement: auth.placement,
    }
  return { type: "none" }
}
