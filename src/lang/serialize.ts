import yaml from "js-yaml"
import type { Auth, Request } from "../schema"

function yamlVal(val: string): string {
  return yaml.dump(val, { lineWidth: 0 }).trim()
}

export function serializeRequest(req: Request): string {
  let out = ""

  out += `name: ${yamlVal(req.name)}\n`
  out += `method: ${yamlVal(req.method)}\n`
  out += `url: ${yamlVal(req.url)}\n`
  out += `timeout: ${String(req.timeout)}\n`

  if (Object.keys(req.headers).length > 0) {
    out += "headers:\n"
    for (const [k, v] of Object.entries(req.headers)) {
      const val = yamlVal(v.value)
      if (v.enabled) {
        out += `  ${k}: ${val}\n`
      } else {
        out += `  ${k}: { value: ${val}, enabled: false }\n`
      }
    }
  }

  if (Object.keys(req.params).length > 0) {
    out += "params:\n"
    for (const [k, v] of Object.entries(req.params)) {
      const val = yamlVal(v.value)
      if (v.enabled) {
        out += `  ${k}: ${val}\n`
      } else {
        out += `  ${k}: { value: ${val}, enabled: false }\n`
      }
    }
  }

  if (req.body !== undefined) {
    out += `body: ${yamlVal(req.body)}\n`
  }

  if (req.auth && req.auth.type !== "none") {
    const authObj = authToObj(req.auth)
    out += "auth:\n"
    for (const [k, v] of Object.entries(authObj)) {
      out += `  ${k}: ${yaml.dump(v, { lineWidth: 0 }).trim()}\n`
    }
  }

  return out
}

function authToObj(auth: Auth): Record<string, unknown> {
  if (auth.type === "none") return { type: "none" }
  if (auth.type === "bearer") return { type: "bearer", token: auth.token }
  return { type: "basic", user: auth.user, pass: auth.pass }
}
