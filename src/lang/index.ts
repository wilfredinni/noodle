import type { Request } from "../schema"
import { parseRequest } from "./parse"
import { serializeRequest } from "./serialize"

export interface Lang {
  parseRequest(id: string, yaml: string): Request
  serializeRequest(req: Request): string
}

export const lang: Lang = {
  parseRequest,
  serializeRequest,
}
