import yaml from "js-yaml"
import type { Auth, Request } from "../schema"

export function serializeRequest(req: Request): string {
  const obj: Record<string, unknown> = {}

  obj.name = req.name
  obj.method = req.method
  obj.url = req.url

  if (Object.keys(req.headers).length > 0) {
    obj.headers = req.headers
  }
  if (Object.keys(req.params).length > 0) {
    obj.params = req.params
  }
  if (req.body !== undefined) {
    obj.body = req.body
  }
  if (req.auth && req.auth.type !== "none") {
    obj.auth = authToObj(req.auth)
  }

  return yaml.dump(obj, { lineWidth: 0 })
}

function authToObj(auth: Auth): Record<string, unknown> {
  if (auth.type === "none") return { type: "none" }
  if (auth.type === "bearer") return { type: "bearer", token: auth.token }
  return { type: "basic", user: auth.user, pass: auth.pass }
}
