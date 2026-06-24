import type { Request } from "../schema"

export interface Lang {
  parseRequest(id: string, yaml: string): Request
  serializeRequest(req: Request): string
}

export const lang: Lang = {
  parseRequest() {
    throw new Error("lang.parseRequest: not implemented")
  },
  serializeRequest() {
    throw new Error("lang.serializeRequest: not implemented")
  },
}
