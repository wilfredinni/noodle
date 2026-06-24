import type { Request } from "../schema"
import { parseRequest } from "./parse"

export interface Lang {
  parseRequest(id: string, yaml: string): Request
  serializeRequest(req: Request): string
}

export const lang: Lang = {
  parseRequest,
  serializeRequest() {
    throw new Error("lang.serializeRequest: not implemented")
  },
}
