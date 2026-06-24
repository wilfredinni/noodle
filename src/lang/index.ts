import type { Collection, Request } from "../schema"

export interface Lang {
  parseRequest(yaml: string): Request
  serializeRequest(req: Request): string
  parseCollection(yaml: string): Collection
}

export const lang: Lang = {
  parseRequest() {
    throw new Error("lang.parseRequest: not implemented")
  },
  serializeRequest() {
    throw new Error("lang.serializeRequest: not implemented")
  },
  parseCollection() {
    throw new Error("lang.parseCollection: not implemented")
  },
}
