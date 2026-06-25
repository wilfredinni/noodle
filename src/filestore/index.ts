import type { Collection, Request } from "../schema"
import { loadCollection } from "./load"
import { saveRequest } from "./save"

export interface Filestore {
  loadCollection(dir: string): Promise<Collection>
  saveRequest(dir: string, req: Request): Promise<void>
}

export const filestore: Filestore = {
  loadCollection,
  saveRequest,
}
