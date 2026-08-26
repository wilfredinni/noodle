import type { Folder, Request } from "../schema"
import { parseRequest } from "./parse"
import { serializeRequest } from "./serialize"
import { parseFolder, serializeFolder } from "./folder"

export interface Lang {
  parseRequest(id: string, yaml: string): Request
  serializeRequest(req: Request): string
  parseFolder(yaml: string): {
    meta?: import("../schema").FolderMeta
    tags?: string[]
    overrides?: import("../schema").FolderOverrides
  }
  serializeFolder(folder: Folder): string
}

export const lang: Lang = {
  parseRequest,
  serializeRequest,
  parseFolder,
  serializeFolder,
}
